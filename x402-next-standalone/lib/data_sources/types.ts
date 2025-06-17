/**
 * Common types and interfaces for data sources
 */

// Represents the standardized output from any data source
export interface DataSourceResult {
  sourceName: string;
  success: boolean;
  response?: string; // Clean, human-readable response
  sources?: string[]; // Optional source URLs/references
  error?: string;
}

// Options that can be passed to data sources
export interface DataSourceOptions {
  castHash?: string;
}

// The interface that every data source class must implement
export interface IDataSource {
  name: string;
  description: string;
  fetch(prompt: string, options?: DataSourceOptions): Promise<DataSourceResult>;
  cleanup?(): Promise<void>;
}

// Helper function to create a successful result
/**
 * Creates a successful data source result
 *
 * @param sourceName - The name of the data source
 * @param response - The human-readable response text
 * @param sources - Optional array of source URLs/references
 * @returns A successful DataSourceResult
 */
export function createSuccessResult(
  sourceName: string,
  response: string,
  sources?: string[],
): DataSourceResult {
  return {
    sourceName,
    success: true,
    response,
    sources,
  };
}

// Helper function to create an error result
/**
 * Creates an error data source result
 *
 * @param sourceName - The name of the data source
 * @param error - The error message
 * @returns An error DataSourceResult
 */
export function createErrorResult(sourceName: string, error: string): DataSourceResult {
  return {
    sourceName,
    success: false,
    error,
  };
}
