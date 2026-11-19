export function newBroadcastEvents<Event extends { index: number }>(events: Event[], seen: number) {
	const incoming = new Map<number, Event>();
	for (const event of events) {
		if (event.index > seen && !incoming.has(event.index)) incoming.set(event.index, event);
	}
	return [...incoming.values()].sort((a, b) => a.index - b.index);
}
