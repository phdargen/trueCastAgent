/**
 * Data Source Registry
 * Automatically includes only enabled data sources based on configuration
 */

import { IDataSource } from "./types";
import { config } from "../config";
import { PerplexityDataSource } from "./perplexity";
import { TavilyDataSource } from "./tavily";
import { XTwitterDataSource } from "./x-twitter";
import { PythDataSource } from "./pyth";
import { DefiLlamaDataSource } from "./defillama";
import { TrueMarketsDataSource } from "./truemarkets";

export const enabledDataSources: IDataSource[] = [];

// Add data sources based on configuration
if (config.dataSources.perplexity.enabled) {
  enabledDataSources.push(new PerplexityDataSource());
}

if (config.dataSources.tavily.enabled) {
  enabledDataSources.push(new TavilyDataSource());
}

if (config.dataSources.xTwitter.enabled) {
  enabledDataSources.push(new XTwitterDataSource());
}

if (config.dataSources.pyth.enabled) {
  enabledDataSources.push(new PythDataSource());
}

if (config.dataSources.defillama.enabled) {
  enabledDataSources.push(new DefiLlamaDataSource());
}

if (config.dataSources.truemarkets.enabled) {
  enabledDataSources.push(new TrueMarketsDataSource());
}

// Export available data source names for reference
export const availableDataSourceNames = enabledDataSources.map(source => source.name);

// Helper function to get data source by name
/**
 * Retrieves a data source instance by its name
 *
 * @param name - The name of the data source to find
 * @returns The data source instance if found, undefined otherwise
 */
export function getDataSourceByName(name: string): IDataSource | undefined {
  return enabledDataSources.find(source => source.name === name);
}
