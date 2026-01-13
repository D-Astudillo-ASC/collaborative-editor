// PREVIOUS IMPLEMENTATION (commented out):
// - Templates lived inside `CodeEditor.tsx` and were applied by broadcasting full content strings.
//
// Reason for change:
// - Template selection should happen at document creation time, and the selected content should be persisted as the
//   initial Yjs update so all clients load the same starting content.

export const CODE_TEMPLATES = {
  blank: {
    name: 'Blank File',
    description: 'Start with an empty file',
    languages: ['javascript', 'typescript', 'tsx', 'java', 'python'],
    content: '',
  },
  reactComponent: {
    name: 'React Component',
    description: 'Basic React functional component',
    languages: ['javascript', 'typescript', 'tsx'],
    content: `import React from 'react';

interface ComponentNameProps {
  prop: string;
}

const ComponentName: React.FC<ComponentNameProps> = ({ prop }) => {
  return (
    <div>
      <h1>{prop}</h1>
    </div>
  );
};

export default ComponentName;
`,
  },
  reactTSXComponent: {
    name: 'React TSX Component',
    description: 'TypeScript React component with JSX',
    languages: ['tsx'],
    content: `import React, { useState, useEffect } from 'react';

interface ComponentNameProps {
  title: string;
  initialCount?: number;
}

const ComponentName: React.FC<ComponentNameProps> = ({ 
  title, 
  initialCount = 0 
}) => {
  const [count, setCount] = useState<number>(initialCount);

  useEffect(() => {
    console.log('Component mounted');
    return () => {
      console.log('Component unmounted');
    };
  }, []);

  const handleIncrement = (): void => {
    setCount(prev => prev + 1);
  };

  return (
    <div className="component">
      <h1>{title}</h1>
      <p>Count: {count}</p>
      <button onClick={handleIncrement}>
        Increment
      </button>
    </div>
  );
};

export default ComponentName;
`,
  },
  reactHook: {
    name: 'React Hook',
    description: 'Custom React hook template',
    languages: ['javascript', 'typescript', 'tsx'],
    content: `import { useState, useEffect } from 'react';

const useHookName = (initialValue: any) => {
  const [state, setState] = useState(initialValue);

  useEffect(() => {
    // Effect logic here
    return () => {
      // Cleanup logic here
    };
  }, [state]);

  return { state, setState };
};

export default useHookName;
`,
  },
  expressRoute: {
    name: 'Express Route',
    description: 'Express.js API route handler',
    languages: ['javascript', 'typescript'],
    content: `import express from 'express';
const router = express.Router();

// GET /api/endpoint
router.get('/api/endpoint', async (req, res) => {
  try {
    const { param } = req.params;
    
    // Your logic here
    const result = await someFunction(param);
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
`,
  },
} as const;

export type CodeTemplateKey = keyof typeof CODE_TEMPLATES;

