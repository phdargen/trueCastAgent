/**
 * Common types and interfaces for data sources
 */

// Represents the standardized output from any data source
export interface DataSourceResult {
  sourceName: string;
  data: unknown;
  success: boolean;
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
 * @param data - The data returned by the source
 * @returns A successful DataSourceResult
 */
export function createSuccessResult(sourceName: string, data: unknown): DataSourceResult {
  return {
    sourceName,
    data,
    success: true,
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
    data: null,
    success: false,
    error,
  };
}
