import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { RawNewsworthyEvent } from './types';

/**
 * Pre-filters a list of raw newsworthy events using an AI model to select the most interesting ones.
 * @param rawEvents Array of raw newsworthy events.
 * @param maxEventsToProcess The maximum number of events to return.
 * @returns A promise that resolves to an array of the most interesting events, up to maxEventsToProcess.
 */
export async function preFilterEvents(
    rawEvents: RawNewsworthyEvent[],
    maxEventsToProcess: number
): Promise<RawNewsworthyEvent[]> {
    if (rawEvents.length <= maxEventsToProcess) {
        return rawEvents; // No need to pre-filter if already within the limit
    }

    console.log(`More than ${maxEventsToProcess} raw events (${rawEvents.length}). Pre-filtering for the most interesting...`);

    const preFilterSchema = z.object({
        selectedIndices: z.array(z.number()).describe(
            `Indices of the top ${maxEventsToProcess} most interesting events from the original list.`
        )
    });

    const preFilterPrompt = `You are a news analyst. Select the ${maxEventsToProcess} most potentially interesting/newsworthy events from the list below based on their question, rules, and event type/details. Return only the original indices of your selections.
      Events:
      ${rawEvents.map((event, idx) => {
        let details = `[${idx}] ${event.eventType} - "${event.marketQuestion}" (Category: ${event.category || 'N/A'})`;
        if (event.additionalInfo) details += `\nRules: ${event.additionalInfo}`;
        if (event.eventType === "yesPriceChange") {
            details += `\nDetails: Price for yes outcome moved from ${event.previousPrice ? (event.previousPrice * 100).toFixed(2) : '?'}% to ${event.newPrice ? (event.newPrice * 100).toFixed(2) : '?'}%`;
        } else if (event.eventType === "statusChange") {
            details += `\nDetails: Status changed from ${event.previousStatus ?? '?'} to ${event.newStatus ?? '?'} (${event.statusText ?? 'N/A'})`;
        } else if (event.eventType === "New") {
            details += `\nDetails: Initial yes price: ${event.initialYesPrice}, TVL: ${event.tvl}`;
        }
        return details;
    }).join('\n\n')}

Return the indices of the top ${maxEventsToProcess} events.`;

    try {
        const preFilterResult = await generateObject({
            model: openai.responses('gpt-4o'),
            schema: preFilterSchema,
            prompt: preFilterPrompt,
        });

        const eventsToProcess = preFilterResult.object.selectedIndices
            .map(index => rawEvents[index])
            .filter(event => event !== undefined); // Filter out potential undefined entries

        console.log(`Pre-filtered down to ${eventsToProcess.length} most interesting events.`);
        return eventsToProcess;

    } catch (error) {
        console.error("Error during pre-filtering events:", error);
        // If pre-filtering fails, return the original first maxEventsToProcess
        const fallbackEvents = rawEvents.slice(0, maxEventsToProcess);
        console.warn(`Pre-filtering failed. Proceeding with the first ${fallbackEvents.length} raw events.`);
        return fallbackEvents;
    }
} 