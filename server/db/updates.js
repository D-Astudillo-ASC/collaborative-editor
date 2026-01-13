const { getPool } = require('./pool');

async function getDocumentState(documentId) {
  const pool = getPool();
  const res = await pool.query(
    `
      select
        latest_snapshot_seq as "latestSnapshotSeq",
        latest_snapshot_r2_key as "latestSnapshotR2Key",
        latest_update_seq as "latestUpdateSeq"
      from document_state
      where document_id = $1;
    `,
    [documentId]
  );
  return res.rows[0] || null;
}

async function fetchUpdatesAfter({ documentId, afterSeq }) {
  const pool = getPool();
  const res = await pool.query(
    `
      select seq, update
      from document_updates
      where document_id = $1 and seq > $2
      order by seq asc;
    `,
    [documentId, afterSeq]
  );
  return res.rows.map((r) => ({ seq: r.seq, update: r.update }));
}

async function appendUpdate({ documentId, actorUserId, updateBytes }) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('begin;');
    const stateRes = await client.query(
      `select latest_update_seq from document_state where document_id = $1 for update;`,
      [documentId]
    );
    if (!stateRes.rows[0]) {
      const err = new Error('document_state_missing');
      err.statusCode = 404;
      throw err;
    }

    const nextSeq = BigInt(stateRes.rows[0].latest_update_seq) + 1n;
    await client.query(
      `
        insert into document_updates (document_id, seq, actor_user_id, update)
        values ($1, $2, $3, $4);
      `,
      [documentId, nextSeq.toString(), actorUserId || null, Buffer.from(updateBytes)]
    );
    await client.query(
      `update document_state set latest_update_seq = $2, updated_at = now() where document_id = $1;`,
      [documentId, nextSeq.toString()]
    );

    await client.query('commit;');
    return Number(nextSeq);
  } catch (e) {
    await client.query('rollback;');
    throw e;
  } finally {
    client.release();
  }
}

async function markSnapshot({ documentId, snapshotSeq, r2Key, pruneUpdatesBeforeSnapshot }) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('begin;');
    await client.query(
      `
        update document_state
        set latest_snapshot_seq = $2,
            latest_snapshot_r2_key = $3,
            updated_at = now()
        where document_id = $1;
      `,
      [documentId, snapshotSeq, r2Key]
    );

    if (pruneUpdatesBeforeSnapshot) {
      await client.query(
        `delete from document_updates where document_id = $1 and seq <= $2;`,
        [documentId, snapshotSeq]
      );
    }

    await client.query('commit;');
  } catch (e) {
    await client.query('rollback;');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { getDocumentState, fetchUpdatesAfter, appendUpdate, markSnapshot };

