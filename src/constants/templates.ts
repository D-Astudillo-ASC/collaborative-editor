import type { Template, Language } from '@/types';

// JavaScript/TypeScript Templates
const reactComponent: Template = {
  id: 'react-component',
  name: 'React Component',
  language: 'javascript',
  category: 'React',
  description: 'Basic functional component with props',
  code: `import React from 'react';

interface Props {
  title: string;
  children?: React.ReactNode;
}

const Component = ({ title, children }: Props) => {
  return (
    <div className="component">
      <h2>{title}</h2>
      {children}
    </div>
  );
};

export default Component;
`,
};

const reactTsxComponent: Template = {
  id: 'react-tsx-component',
  name: 'React TSX Component',
  language: 'typescriptreact',
  category: 'React',
  description: 'TypeScript React with hooks, useState, useEffect',
  code: `import React, { useState, useEffect } from 'react';

interface Props {
  initialValue?: string;
  onValueChange?: (value: string) => void;
}

const Component: React.FC<Props> = ({ initialValue = '', onValueChange }) => {
  const [value, setValue] = useState<string>(initialValue);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Simulate data fetching
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    onValueChange?.(value);
  }, [value, onValueChange]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="component">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter value..."
      />
      <p>Current value: {value}</p>
    </div>
  );
};

export default Component;
`,
};

const reactHook: Template = {
  id: 'react-hook',
  name: 'React Hook',
  language: 'typescript',
  category: 'React',
  description: 'Custom hook template',
  code: `import { useState, useEffect, useCallback } from 'react';

interface UseCustomHookOptions {
  initialValue?: string;
  onError?: (error: Error) => void;
}

interface UseCustomHookReturn {
  value: string;
  isLoading: boolean;
  error: Error | null;
  setValue: (value: string) => void;
  reset: () => void;
}

export function useCustomHook(options: UseCustomHookOptions = {}): UseCustomHookReturn {
  const { initialValue = '', onError } = options;
  
  const [value, setValue] = useState<string>(initialValue);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Effect logic here
    setIsLoading(true);
    
    try {
      // Async operations
      setIsLoading(false);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      onError?.(error);
      setIsLoading(false);
    }
  }, [onError]);

  const reset = useCallback(() => {
    setValue(initialValue);
    setError(null);
  }, [initialValue]);

  return {
    value,
    isLoading,
    error,
    setValue,
    reset,
  };
}
`,
};

const expressRoute: Template = {
  id: 'express-route',
  name: 'Express Route',
  language: 'javascript',
  category: 'Node.js',
  description: 'API route handler with error handling',
  code: `const express = require('express');
const router = express.Router();

// Middleware for this route
const validateRequest = (req, res, next) => {
  const { id } = req.params;
  if (!id || isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'Invalid ID parameter' });
  }
  next();
};

// GET /api/resource/:id
router.get('/:id', validateRequest, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Fetch resource from database
    const resource = await findResourceById(id);
    
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    
    res.json({ data: resource });
  } catch (error) {
    console.error('Error fetching resource:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/resource
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const resource = await createResource({ name, description });
    
    res.status(201).json({ data: resource });
  } catch (error) {
    console.error('Error creating resource:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
`,
};

const nodeClass: Template = {
  id: 'node-class',
  name: 'Node.js Class',
  language: 'javascript',
  category: 'Node.js',
  description: 'ES6 class with async methods',
  code: `class Service {
  constructor(config = {}) {
    this.config = config;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
      console.warn('Service already initialized');
      return;
    }

    try {
      // Initialization logic
      console.log('Initializing service...');
      await this._connect();
      this.isInitialized = true;
      console.log('Service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize service:', error);
      throw error;
    }
  }

  async _connect() {
    // Private connection logic
    return new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  async process(data) {
    if (!this.isInitialized) {
      throw new Error('Service not initialized');
    }

    try {
      // Process data
      const result = await this._transform(data);
      return result;
    } catch (error) {
      console.error('Processing error:', error);
      throw error;
    }
  }

  async _transform(data) {
    // Transform logic
    return { ...data, processed: true, timestamp: Date.now() };
  }

  async shutdown() {
    if (!this.isInitialized) return;

    console.log('Shutting down service...');
    this.isInitialized = false;
    console.log('Service shutdown complete');
  }
}

module.exports = Service;
`,
};

const typescriptInterface: Template = {
  id: 'typescript-interface',
  name: 'TypeScript Interface',
  language: 'typescript',
  category: 'TypeScript',
  description: 'With generics and type definitions',
  code: `// Base entity interface
interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// Generic response wrapper
interface ApiResponse<T> {
  data: T;
  meta: {
    total: number;
    page: number;
    limit: number;
  };
  error?: string;
}

// Utility types
type Nullable<T> = T | null;
type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Example entity
interface User extends BaseEntity {
  email: string;
  name: string;
  role: 'admin' | 'user' | 'guest';
  profile: UserProfile;
}

interface UserProfile {
  avatar?: string;
  bio?: string;
  preferences: UserPreferences;
}

interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  notifications: boolean;
  language: string;
}

// Function type
type UserValidator = (user: Partial<User>) => Promise<boolean>;

// Generic repository interface
interface Repository<T extends BaseEntity> {
  findById(id: string): Promise<Nullable<T>>;
  findAll(options?: QueryOptions): Promise<T[]>;
  create(data: Omit<T, keyof BaseEntity>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
}

interface QueryOptions {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  filter?: Record<string, unknown>;
}

export type { User, UserProfile, ApiResponse, Repository, QueryOptions };
`,
};

const asyncFunction: Template = {
  id: 'async-function',
  name: 'Async Function',
  language: 'javascript',
  category: 'JavaScript',
  description: 'With error handling and validation',
  code: `/**
 * Fetches and processes data from an API endpoint
 * @param {string} endpoint - The API endpoint to fetch from
 * @param {Object} options - Configuration options
 * @param {number} options.timeout - Request timeout in ms
 * @param {number} options.retries - Number of retry attempts
 * @returns {Promise<Object>} The processed data
 * @throws {Error} If validation fails or request errors
 */
async function fetchAndProcess(endpoint, options = {}) {
  const { timeout = 5000, retries = 3 } = options;

  // Validate input
  if (!endpoint || typeof endpoint !== 'string') {
    throw new Error('Invalid endpoint: must be a non-empty string');
  }

  if (!endpoint.startsWith('http')) {
    throw new Error('Invalid endpoint: must be a valid URL');
  }

  let lastError;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(\`Attempt \${attempt}/\${retries}: Fetching \${endpoint}\`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(endpoint, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(\`HTTP error: \${response.status} \${response.statusText}\`);
      }

      const data = await response.json();
      
      // Process and validate response
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response: expected object');
      }

      return {
        success: true,
        data,
        metadata: {
          endpoint,
          fetchedAt: new Date().toISOString(),
          attempts: attempt,
        },
      };
    } catch (error) {
      lastError = error;
      console.warn(\`Attempt \${attempt} failed:\`, error.message);
      
      if (attempt < retries) {
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(\`Failed after \${retries} attempts: \${lastError.message}\`);
}

module.exports = { fetchAndProcess };
`,
};

const testFile: Template = {
  id: 'test-file',
  name: 'Test File',
  language: 'javascript',
  category: 'Testing',
  description: 'Jest test template',
  code: `const { describe, test, expect, beforeEach, afterEach, jest } = require('@jest/globals');

// Import the module to test
// const { myFunction, MyClass } = require('./myModule');

describe('MyModule', () => {
  let instance;
  
  beforeEach(() => {
    // Setup before each test
    instance = {}; // new MyClass();
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Cleanup after each test
    instance = null;
  });

  describe('myFunction', () => {
    test('should return expected result for valid input', () => {
      const input = 'test';
      const expected = 'TEST';
      
      // const result = myFunction(input);
      const result = input.toUpperCase();
      
      expect(result).toBe(expected);
    });

    test('should handle edge cases', () => {
      expect(() => {
        // myFunction(null);
      }).not.toThrow();
    });

    test('should throw error for invalid input', () => {
      expect(() => {
        throw new Error('Invalid input');
      }).toThrow('Invalid input');
    });
  });

  describe('MyClass', () => {
    test('should initialize with default values', () => {
      expect(instance).toBeDefined();
      // expect(instance.property).toBe(defaultValue);
    });

    test('should handle async operations', async () => {
      const mockData = { id: 1, name: 'Test' };
      
      // Mock async method
      // jest.spyOn(instance, 'fetchData').mockResolvedValue(mockData);
      
      // const result = await instance.fetchData();
      const result = mockData;
      
      expect(result).toEqual(mockData);
    });
  });
});
`,
};

// Java Templates
const javaClass: Template = {
  id: 'java-class',
  name: 'Java Class',
  language: 'java',
  category: 'Java',
  description: 'With constructor, getters, setters, toString, main method',
  code: `public class MyClass {
    private String name;
    private int value;
    private boolean active;

    // Default constructor
    public MyClass() {
        this.name = "";
        this.value = 0;
        this.active = false;
    }

    // Parameterized constructor
    public MyClass(String name, int value, boolean active) {
        this.name = name;
        this.value = value;
        this.active = active;
    }

    // Getters
    public String getName() {
        return name;
    }

    public int getValue() {
        return value;
    }

    public boolean isActive() {
        return active;
    }

    // Setters
    public void setName(String name) {
        this.name = name;
    }

    public void setValue(int value) {
        this.value = value;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    @Override
    public String toString() {
        return "MyClass{" +
                "name='" + name + '\\'' +
                ", value=" + value +
                ", active=" + active +
                '}';
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        MyClass myClass = (MyClass) o;
        return value == myClass.value &&
                active == myClass.active &&
                name.equals(myClass.name);
    }

    @Override
    public int hashCode() {
        return java.util.Objects.hash(name, value, active);
    }

    public static void main(String[] args) {
        MyClass instance = new MyClass("Example", 42, true);
        System.out.println(instance);
    }
}
`,
};

const javaInterface: Template = {
  id: 'java-interface',
  name: 'Java Interface',
  language: 'java',
  category: 'Java',
  description: 'With default and static methods',
  code: `public interface MyInterface {
    
    // Abstract method (must be implemented)
    void process(String data);
    
    // Abstract method with return type
    String transform(String input);
    
    // Default method (has implementation)
    default void log(String message) {
        System.out.println("[LOG] " + message);
    }
    
    // Default method with logic
    default boolean validate(String input) {
        if (input == null || input.isEmpty()) {
            log("Validation failed: input is null or empty");
            return false;
        }
        log("Validation passed");
        return true;
    }
    
    // Static utility method
    static String formatMessage(String template, Object... args) {
        return String.format(template, args);
    }
    
    // Static factory method
    static MyInterface createDefault() {
        return new MyInterface() {
            @Override
            public void process(String data) {
                log("Processing: " + data);
            }
            
            @Override
            public String transform(String input) {
                return input != null ? input.toUpperCase() : "";
            }
        };
    }
    
    // Constant (implicitly public static final)
    String VERSION = "1.0.0";
}
`,
};

const javaMainClass: Template = {
  id: 'java-main-class',
  name: 'Java Main Class',
  language: 'java',
  category: 'Java',
  description: 'With Scanner input',
  code: `import java.util.Scanner;

public class Main {
    private static final Scanner scanner = new Scanner(System.in);

    public static void main(String[] args) {
        System.out.println("=== Java Application ===");
        System.out.println();

        try {
            // Get user input
            System.out.print("Enter your name: ");
            String name = scanner.nextLine();

            System.out.print("Enter your age: ");
            int age = Integer.parseInt(scanner.nextLine());

            System.out.print("Enter your email: ");
            String email = scanner.nextLine();

            // Validate input
            if (name.isEmpty()) {
                throw new IllegalArgumentException("Name cannot be empty");
            }
            if (age < 0 || age > 150) {
                throw new IllegalArgumentException("Invalid age");
            }
            if (!email.contains("@")) {
                throw new IllegalArgumentException("Invalid email format");
            }

            // Process and display
            System.out.println();
            System.out.println("=== User Information ===");
            System.out.println("Name: " + name);
            System.out.println("Age: " + age);
            System.out.println("Email: " + email);
            System.out.println("Status: " + (age >= 18 ? "Adult" : "Minor"));

        } catch (NumberFormatException e) {
            System.err.println("Error: Please enter a valid number for age");
        } catch (IllegalArgumentException e) {
            System.err.println("Error: " + e.getMessage());
        } finally {
            scanner.close();
            System.out.println();
            System.out.println("Program completed.");
        }
    }
}
`,
};

const javaMainMethod: Template = {
  id: 'java-main-method',
  name: 'Java Main Method',
  language: 'java',
  category: 'Java',
  description: 'Simple entry point',
  code: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
        
        // Process command line arguments
        if (args.length > 0) {
            System.out.println("Arguments received:");
            for (int i = 0; i < args.length; i++) {
                System.out.println("  [" + i + "] " + args[i]);
            }
        }
    }
}
`,
};

// Python Templates
const pythonClass: Template = {
  id: 'python-class',
  name: 'Python Class',
  language: 'python',
  category: 'Python',
  description: 'With __init__, getters, setters, __str__, __repr__',
  code: `from typing import Optional, Any
from dataclasses import dataclass, field
from datetime import datetime


class MyClass:
    """A sample Python class with common patterns."""
    
    def __init__(self, name: str, value: int = 0, active: bool = True) -> None:
        """Initialize MyClass instance.
        
        Args:
            name: The name of the instance
            value: An integer value (default: 0)
            active: Whether the instance is active (default: True)
        """
        self._name = name
        self._value = value
        self._active = active
        self._created_at = datetime.now()
    
    # Properties (Pythonic getters/setters)
    @property
    def name(self) -> str:
        """Get the name."""
        return self._name
    
    @name.setter
    def name(self, value: str) -> None:
        """Set the name."""
        if not value:
            raise ValueError("Name cannot be empty")
        self._name = value
    
    @property
    def value(self) -> int:
        """Get the value."""
        return self._value
    
    @value.setter
    def value(self, value: int) -> None:
        """Set the value."""
        if value < 0:
            raise ValueError("Value must be non-negative")
        self._value = value
    
    @property
    def active(self) -> bool:
        """Check if active."""
        return self._active
    
    @active.setter
    def active(self, value: bool) -> None:
        """Set active status."""
        self._active = value
    
    @property
    def created_at(self) -> datetime:
        """Get creation timestamp (read-only)."""
        return self._created_at
    
    def __str__(self) -> str:
        """Return string representation for users."""
        return f"MyClass(name='{self._name}', value={self._value}, active={self._active})"
    
    def __repr__(self) -> str:
        """Return string representation for developers."""
        return f"MyClass(name={self._name!r}, value={self._value!r}, active={self._active!r})"
    
    def __eq__(self, other: Any) -> bool:
        """Check equality."""
        if not isinstance(other, MyClass):
            return NotImplemented
        return (self._name, self._value, self._active) == (other._name, other._value, other._active)
    
    def __hash__(self) -> int:
        """Return hash value."""
        return hash((self._name, self._value, self._active))


if __name__ == "__main__":
    # Example usage
    instance = MyClass("Example", 42, True)
    print(instance)
    print(f"Name: {instance.name}")
    print(f"Created at: {instance.created_at}")
`,
};

const pythonFunction: Template = {
  id: 'python-function',
  name: 'Python Function',
  language: 'python',
  category: 'Python',
  description: 'With type hints, docstrings, error handling',
  code: `from typing import Optional, List, Dict, Any, Union
from functools import wraps
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def validate_input(func):
    """Decorator to validate function inputs."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        logger.debug(f"Calling {func.__name__} with args={args}, kwargs={kwargs}")
        try:
            result = func(*args, **kwargs)
            logger.debug(f"{func.__name__} returned: {result}")
            return result
        except Exception as e:
            logger.error(f"Error in {func.__name__}: {e}")
            raise
    return wrapper


@validate_input
def process_data(
    data: List[Dict[str, Any]],
    *,
    filter_key: Optional[str] = None,
    transform: bool = True,
    max_items: int = 100
) -> Dict[str, Any]:
    """Process a list of data items with optional filtering and transformation.
    
    Args:
        data: List of dictionaries to process
        filter_key: Optional key to filter items (only include items with this key)
        transform: Whether to apply transformation (default: True)
        max_items: Maximum number of items to process (default: 100)
    
    Returns:
        Dictionary containing processed data and metadata
        
    Raises:
        ValueError: If data is empty or invalid
        TypeError: If data is not a list
        
    Example:
        >>> result = process_data([{"id": 1, "name": "test"}])
        >>> print(result["count"])
        1
    """
    # Validate input
    if not isinstance(data, list):
        raise TypeError(f"Expected list, got {type(data).__name__}")
    
    if not data:
        raise ValueError("Data cannot be empty")
    
    # Filter data
    filtered = data
    if filter_key:
        filtered = [item for item in data if filter_key in item]
        logger.info(f"Filtered {len(data)} items to {len(filtered)} with key '{filter_key}'")
    
    # Limit items
    limited = filtered[:max_items]
    
    # Transform if requested
    if transform:
        limited = [_transform_item(item) for item in limited]
    
    return {
        "items": limited,
        "count": len(limited),
        "filtered": len(data) - len(filtered),
        "truncated": len(filtered) > max_items,
        "metadata": {
            "filter_key": filter_key,
            "transform_applied": transform,
            "max_items": max_items
        }
    }


def _transform_item(item: Dict[str, Any]) -> Dict[str, Any]:
    """Transform a single data item (private helper)."""
    return {
        **item,
        "_processed": True,
        "_timestamp": __import__("datetime").datetime.now().isoformat()
    }


if __name__ == "__main__":
    # Example usage
    sample_data = [
        {"id": 1, "name": "Alice", "score": 95},
        {"id": 2, "name": "Bob", "score": 87},
        {"id": 3, "name": "Charlie", "score": 92},
    ]
    
    result = process_data(sample_data, filter_key="name", transform=True)
    print(f"Processed {result['count']} items")
`,
};

const pythonMain: Template = {
  id: 'python-main',
  name: 'Python Main',
  language: 'python',
  category: 'Python',
  description: 'With argparse, command-line arguments',
  code: `#!/usr/bin/env python3
"""Main entry point for the application.

This module provides a command-line interface for the application.

Usage:
    python main.py --input data.txt --output result.json
    python main.py -v --dry-run
"""

import argparse
import logging
import sys
from pathlib import Path
from typing import Optional


def setup_logging(verbose: bool = False) -> logging.Logger:
    """Configure logging based on verbosity level."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    return logging.getLogger(__name__)


def parse_arguments() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Application description here.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    %(prog)s --input data.txt
    %(prog)s -i input.csv -o output.json --verbose
    %(prog)s --dry-run
        """
    )
    
    # Required arguments
    parser.add_argument(
        "-i", "--input",
        type=Path,
        required=True,
        help="Input file path"
    )
    
    # Optional arguments
    parser.add_argument(
        "-o", "--output",
        type=Path,
        default=None,
        help="Output file path (default: stdout)"
    )
    
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose output"
    )
    
    parser.add_argument(
        "-n", "--dry-run",
        action="store_true",
        help="Perform a dry run without making changes"
    )
    
    parser.add_argument(
        "--version",
        action="version",
        version="%(prog)s 1.0.0"
    )
    
    return parser.parse_args()


def main(args: argparse.Namespace) -> int:
    """Main application logic.
    
    Args:
        args: Parsed command-line arguments
        
    Returns:
        Exit code (0 for success, non-zero for error)
    """
    logger = setup_logging(args.verbose)
    
    logger.info("Starting application...")
    logger.debug(f"Arguments: {args}")
    
    # Validate input file
    if not args.input.exists():
        logger.error(f"Input file not found: {args.input}")
        return 1
    
    try:
        if args.dry_run:
            logger.info("[DRY RUN] Would process: %s", args.input)
        else:
            logger.info("Processing: %s", args.input)
            # Add your processing logic here
            
            if args.output:
                logger.info("Writing output to: %s", args.output)
                # Write output file
        
        logger.info("Completed successfully!")
        return 0
        
    except Exception as e:
        logger.exception("An error occurred: %s", e)
        return 1


if __name__ == "__main__":
    sys.exit(main(parse_arguments()))
`,
};

const pythonMainMethod: Template = {
  id: 'python-main-method',
  name: 'Python Main Method',
  language: 'python',
  category: 'Python',
  description: 'Simple entry point',
  code: `#!/usr/bin/env python3
"""Simple Python script template."""


def main() -> None:
    """Main entry point."""
    print("Hello, World!")


if __name__ == "__main__":
    main()
`,
};

// HTML Templates
const htmlTemplate: Template = {
  id: 'html-template',
  name: 'HTML Template',
  language: 'html',
  category: 'HTML',
  description: 'HTML5 boilerplate with meta tags',
  code: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Page description for SEO">
    <meta name="keywords" content="keyword1, keyword2, keyword3">
    <meta name="author" content="Author Name">
    
    <!-- Open Graph / Social Media -->
    <meta property="og:title" content="Page Title">
    <meta property="og:description" content="Page description">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://example.com">
    <meta property="og:image" content="https://example.com/image.jpg">
    
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Page Title">
    <meta name="twitter:description" content="Page description">
    
    <!-- Favicon -->
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    
    <!-- Stylesheets -->
    <link rel="stylesheet" href="styles.css">
    
    <title>Page Title</title>
</head>
<body>
    <header>
        <nav>
            <a href="/" class="logo">Logo</a>
            <ul>
                <li><a href="/">Home</a></li>
                <li><a href="/about">About</a></li>
                <li><a href="/contact">Contact</a></li>
            </ul>
        </nav>
    </header>
    
    <main>
        <section class="hero">
            <h1>Welcome to My Website</h1>
            <p>A brief description of what this page is about.</p>
            <a href="#cta" class="button">Get Started</a>
        </section>
        
        <section class="content">
            <article>
                <h2>Article Title</h2>
                <p>Article content goes here.</p>
            </article>
        </section>
    </main>
    
    <footer>
        <p>&copy; 2024 Your Company. All rights reserved.</p>
    </footer>
    
    <!-- Scripts -->
    <script src="script.js"></script>
</body>
</html>
`,
};

// Universal Templates
const blankFile: Template = {
  id: 'blank-file',
  name: 'Blank File',
  language: 'javascript', // Default, but works for any
  category: 'Universal',
  description: 'Empty template for any language',
  code: '',
};

// Export all templates
export const templates: Template[] = [
  // JavaScript/TypeScript
  reactComponent,
  reactTsxComponent,
  reactHook,
  expressRoute,
  nodeClass,
  typescriptInterface,
  asyncFunction,
  testFile,
  // Java
  javaClass,
  javaInterface,
  javaMainClass,
  javaMainMethod,
  // Python
  pythonClass,
  pythonFunction,
  pythonMain,
  pythonMainMethod,
  // HTML
  htmlTemplate,
  // Universal
  blankFile,
];

// Helper function to get templates by language
export function getTemplatesByLanguage(language: Language): Template[] {
  const languageMap: Record<Language, Language[]> = {
    javascript: ['javascript'],
    typescript: ['typescript', 'javascript'],
    typescriptreact: ['typescriptreact', 'typescript', 'javascript'],
    java: ['java'],
    python: ['python'],
    html: ['html'],
  };

  const supportedLanguages = languageMap[language] || [language];

  return templates.filter(
    t => supportedLanguages.includes(t.language) || t.category === 'Universal'
  );
}

// Helper function to get template by ID
export function getTemplateById(id: string): Template | undefined {
  return templates.find(t => t.id === id);
}

// Get unique categories
export function getTemplateCategories(): string[] {
  return [...new Set(templates.map(t => t.category))];
}
