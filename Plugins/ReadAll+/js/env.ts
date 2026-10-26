// Everything that touches Discord internals lives here, so if a lookup
// path or export name differs in your Valenced build, this is the only
// file (plus the finder names in patches/) you need to adjust.
import { lookupModule } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'

const cache = new Map<string, any>()

function find<T = any>(key: string, filter: () => any): T | undefined {
	if (cache.has(key)) return cache.get(key)
	try {
		const found = lookupModule(filter())?.[0]
		if (found) cache.set(key, found)
		return found
	} catch {}
}

/** Flux store by name, e.g. store('ReadStateStore') */
export const store = <T = any>(name: string) =>
	find<T>(`store:${name}`, () => withName(name))

export const dispatcher = () =>
	find<{ dispatch(e: any): void }>('dispatcher', () =>
		withProps('dispatch', 'subscribe', 'wait'),
	)

/** Discord's design-system components (TableRow, Text, Slider, ...) */
export const design = (...props: string[]) =>
	find<any>(`design:${props.join(',')}`, () => withProps(...props))

export function toast(text: string, key = 'ReadAllToast') {
	try {
		const t = find<any>('toast', () => withProps('openMana'))
		if (typeof t?.openMana === 'function') return t.openMana(key, { text })
		const t2 = find<any>('toast2', () => withProps('open', 'close'))
		t2?.open?.({ key, content: text })
	} catch {}
}

export const toArray = <T = any>(v: any): T[] =>
	v ? (Array.isArray(v) ? v : Object.values(v)) : []

export function clearCache() {
	cache.clear()
}
