import { after } from '@valenced/patcher'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import React from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { store, toast } from '../env'
import { channelHasUnread, markAllRead } from '../readState'
import { getSettings } from '../settings'
import type { ReadAllApi } from '../settings'

const GAP = 8
const TYPING_OFFSET = 26
const FADE_DELAY = 1200
const FADE_MS = 1500
const KEY = 'read-all'

function useUnreadChannel() {
	const read = () => {
		const selected = store('SelectedChannelStore')?.getChannelId?.() as string | undefined
		return { selected, unread: selected && channelHasUnread(selected) ? selected : undefined }
	}
	const [state, setState] = React.useState(read)

	React.useEffect(() => {
		const stores = [store('ReadStateStore'), store('SelectedChannelStore')].filter(s => s?.addChangeListener)
		let t: ReturnType<typeof setTimeout> | undefined
		const onChange = () => {
			t ??= setTimeout(() => {
				t = undefined
				const next = read()
				setState(p => (p.selected === next.selected && p.unread === next.unread ? p : next))
			}, 200)
		}
		for (const s of stores) s.addChangeListener(onChange)
		onChange()
		return () => {
			if (t) clearTimeout(t)
			for (const s of stores) s.removeChangeListener(onChange)
		}
	}, [])

	return state
}

function Label({ compact, done, pressed, fontSize }: { compact: boolean; done: boolean; pressed: boolean; fontSize: number }) {
	const lh = Math.round(fontSize * 1.34)
	return (
		<View
			style={{
				minWidth: 32,
				minHeight: lh + 12,
				paddingHorizontal: 8,
				paddingVertical: 4,
				borderRadius: 8,
				alignItems: 'center',
				justifyContent: 'center',
				backgroundColor: '#222327',
				elevation: done ? 0 : 4,
				opacity: pressed ? 0.7 : 1,
			}}
		>
			<Text
				numberOfLines={1}
				style={{
					fontSize,
					lineHeight: lh,
					fontWeight: '600',
					color: done ? '#23A55A' : '#F23F43',
				}}
			>
				{done ? (compact ? '✓' : 'Marked as read') : compact ? '✓' : '✓ Mark as read'}
			</Text>
		</View>
	)
}

function ReadPill({ typing }: { typing: boolean }) {
	const { selected, unread } = useUnreadChannel()
	const settings = getSettings()
	const [shown, setShown] = React.useState<string | undefined>(unread)
	const [done, setDone] = React.useState(false)
	const opacity = React.useRef(new Animated.Value(1)).current
	const always = React.useRef(settings.alwaysShow)
	always.current = settings.alwaysShow

	const fadeOut = React.useCallback(() => {
		setDone(true)
		if (always.current) return
		Animated.timing(opacity, { toValue: 0, delay: FADE_DELAY, duration: FADE_MS, useNativeDriver: true }).start(
			({ finished }) => {
				if (finished) {
					setShown(undefined)
					setDone(false)
				}
			},
		)
	}, [opacity])

	React.useEffect(() => {
		if (unread) {
			opacity.stopAnimation()
			opacity.setValue(1)
			setDone(false)
			setShown(unread)
		} else if (settings.alwaysShow && selected) {
			opacity.stopAnimation()
			opacity.setValue(1)
			setDone(true)
			setShown(selected)
		} else if (shown && shown === selected) {
			if (!done || !settings.alwaysShow) fadeOut()
		} else if (shown) {
			opacity.stopAnimation()
			setDone(false)
			setShown(undefined)
		}
	}, [selected, unread, settings.alwaysShow])

	if (!shown) return null

	return (
		<Animated.View
			pointerEvents={done ? 'none' : 'box-none'}
			style={{
				position: 'absolute',
				bottom: '100%',
				marginBottom: GAP + (typing && !settings.compact ? TYPING_OFFSET : 0),
				[settings.side]: 16,
				opacity,
			}}
		>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={done ? 'This chat is marked as read' : 'Mark this chat as read'}
				disabled={done}
				onPress={() => {
					// Marks every server and DM read, except the ones on the exclusion lists.
					try {
						markAllRead()
						fadeOut()
					} catch {
						toast("Couldn't mark chats as read", 'ReadAllChat')
					}
				}}
			>
				{({ pressed }) => <Label compact={settings.compact} done={done} pressed={pressed} fontSize={settings.fontSize} />}
			</Pressable>
		</Animated.View>
	)
}

// --- locating the spots inside ChatInput's render tree ----------------------

const findNode = (node: any, test: (n: any) => boolean, depth = 0): any => {
	if (!node || typeof node !== 'object' || depth > 25) return
	if (!Array.isArray(node) && test(node)) return node
	const kids = Array.isArray(node) ? node : node.props?.children
	if (Array.isArray(kids)) {
		for (const k of kids) {
			const hit = findNode(k, test, depth + 1)
			if (hit) return hit
		}
	} else if (kids && typeof kids === 'object') return findNode(kids, test, depth + 1)
}

// The container we append to: collapsable={false}, has onLayout, children is an array.
const isInputContainer = (n: any) =>
	n?.props?.collapsable === false && typeof n.props.onLayout === 'function' && Array.isArray(n.props.children)

// The "someone is typing" overlay: absolute, full-height, coloured, childless.
const isTypingOverlay = (n: any) => {
	const p = n?.props
	if (!p || p.pointerEvents !== 'none' || p.children != null || !p.style) return false
	const s = StyleSheet.flatten(p.style) ?? {}
	return s.position === 'absolute' && s.top === 0 && s.bottom === 0 && s.backgroundColor != null
}

export default function chatPill({ cleanup, plugin }: ReadAllApi) {
	cleanup(
		getModules(
			withName('ChatInput'),
			(mod: any) => {
				// Revenge-style: default export is a forwardRef/memo wrapping { render }.
				let target = mod?.default ?? mod
				for (let i = 0; i < 3 && target && typeof target.render !== 'function'; i++) target = target.type
				if (typeof target?.render !== 'function') return plugin.reportError(new Error('ChatInput has no render to patch'))

				cleanup(
					after(target, 'render', (tree: any) => {
						try {
							if (!getSettings().chatPill) return tree
							const container = findNode(tree, isInputContainer)
							if (!container || container.props.children.some((c: any) => c?.key === KEY)) return tree
							const typing = container.props.children.some(isTypingOverlay)
							container.props.children = [...container.props.children, <ReadPill key={KEY} typing={typing} />]
						} catch (e) {
							plugin.reportError(e)
						}
						return tree
					}),
				)
			},
			{ returnNamespace: true },
		),
	)
}
