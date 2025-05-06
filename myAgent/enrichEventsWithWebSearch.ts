import { openai } from "@ai-sdk/openai";
import { perplexity } from '@ai-sdk/perplexity';
import { google } from '@ai-sdk/google';
import { generateText } from "ai";
import { ProcessedNewsworthyEvent } from './types';

/**
 * Enriches a list of newsworthy events with context from web searches.
 * @param eventsToProcess Array of events to enrich.
 * @returns A promise that resolves to an array of enriched events.
 */
export async function enrichEventsWithWebSearch(
    eventsToProcess: ProcessedNewsworthyEvent[]
): Promise<ProcessedNewsworthyEvent[]> {
    console.log(`Gathering additional context with web search for ${eventsToProcess.length} events...`);
    const enrichedEvents: ProcessedNewsworthyEvent[] = [];

    for (let i = 0; i < eventsToProcess.length; i++) {
        const event = eventsToProcess[i];
        const enrichedEvent: ProcessedNewsworthyEvent = { ...event }; // Create a copy to enrich

        try {
            const webSearchPrompt = `This is a newsworthy event about a prediction market with question: ${event.marketQuestion},
            ${event.additionalInfo ? `with the rules: ${event.additionalInfo}.` : ''}
              ${event.eventType === "yesPriceChange" ?
                `Chances for yes outcome moved from ${event.previousPrice ? (event.previousPrice * 100).toFixed(2) : 'N/A'}% to ${event.newPrice ? (event.newPrice * 100).toFixed(2) : 'N/A'}%.` :
                event.eventType === "statusChange" ?
                `Status changed to ${event.statusText}.` :
                event.eventType === "New" ?
                `New market created with initial yes price of ${event.initialYesPrice}.` :
                ''}

              ${event.status === 7 || event.status === "Finalized" || event.status === 2 || event.status === "Resolution Proposed" ?
                `This market is ${event.status === 2 || event.status === "Resolution Proposed" ? 'proposed to resolve' : 'finalized'} with winning position: ${event.winningPositionString || 'N/A'}.` :
                `Current chances for yes outcome: ${event.yesPrice ? (event.yesPrice * 100).toFixed(2) : 'N/A'}%, for no outcome: ${event.noPrice ? (event.noPrice * 100).toFixed(2) : 'N/A'}%.`}

              Research this topic to provide additional context that would make this event interesting and newsworthy.
              Focus on finding timely, relevant information about this topic that could explain why this market is moving or why it matters.
              Today's date is ${new Date().toISOString().split('T')[0]}.
              It is very important to undestand the time context of retrieved information from the web search. Newer information should be given priority over older information.
              Keep your final summary concise but insightful.
              `;

            console.log(`Searching for additional context on event: ${event.marketQuestion}`);
            console.log("Web search prompt: ", webSearchPrompt);

            // Try Google Gemini first, then Perplexity, then fall back to OpenAI
            if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
                console.log("Using Gemini for web search");
                const webSearch = await generateText({
                    model: google('gemini-2.0-flash', { useSearchGrounding: true }),
                    prompt: webSearchPrompt,
                });
                enrichedEvent.webSearchResults = webSearch.text;
                enrichedEvent.source = webSearch.sources;
                console.log(`Completed Gemini web search for event: ${event.marketQuestion}`);
            } else if (process.env.PERPLEXITY_API_KEY) {
                console.log("Using Perplexity for web search");
                const { text, sources } = await generateText({
                    model: perplexity('sonar-pro'),
                    prompt: webSearchPrompt,
                    providerOptions: {
                        perplexity: {
                            return_images: false,
                            search_recency_filter: 'week',
                            search_context_size: 'high',
                        },
                    },
                });
                enrichedEvent.webSearchResults = text;
                enrichedEvent.source = sources;
                console.log(`Completed Perplexity web search for event: ${event.marketQuestion}`);
            } else {
                console.log("Using OpenAI for web search");
                const webSearch = await generateText({
                    model: openai.responses('gpt-4.1'),
                    prompt: webSearchPrompt,
                    tools: {
                        web_search_preview: openai.tools.webSearchPreview({
                            searchContextSize: 'high',
                        }),
                    },
                    maxSteps: 3,
                });
                enrichedEvent.webSearchResults = webSearch.text;
                enrichedEvent.source = webSearch.sources;
                console.log(`Completed OpenAI web search for event: ${event.marketQuestion}`);
            }
        } catch (error) {
            console.error(`Error performing web search for event ${event.marketQuestion}:`, error);
        } finally {
            enrichedEvents.push(enrichedEvent); // Add event regardless of search success
        }

        // Brief pause
        if (i < eventsToProcess.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    return enrichedEvents;
} 