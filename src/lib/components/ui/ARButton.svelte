<script lang="ts">
	import { onMount } from 'svelte'
	import Icon from '@iconify/svelte'
	import {
		calculateARScaling,
		formatScalePercentage,
		formatDimensions,
		type ModelDimensions,
		type ARScalingResult
	} from '$lib/utils/arScaling'

	let { glbUrl, usdzUrl, modelDimensions, webxrAvailable = false }: {
		glbUrl?: string;
		usdzUrl?: string;
		modelDimensions?: ModelDimensions;
		webxrAvailable?: boolean;
	} = $props()

	let showButton = $state(false)
	let deviceType: 'ios' | 'android' | 'desktop' = $state('desktop')
	let arLink: HTMLAnchorElement | null = $state(null)
	let showScaleInfo = $state(false)

	// Calculate AR scaling based on model dimensions
	let arScaling = $derived<ARScalingResult | null>(
		modelDimensions ? calculateARScaling(modelDimensions) : null
	)

	/**
	 * Generates the URL for the scaled GLB via our API endpoint.
	 * For models that need scaling, this returns a URL to our server-side
	 * scaling endpoint. For small models, returns the original URL.
	 */
	function getScaledGlbUrl(originalUrl: string): string {
		if (!arScaling?.isScaled) {
			// No scaling needed, use original URL
			return originalUrl
		}

		// Use our server-side scaling endpoint
		// The endpoint will download, scale, and serve the GLB
		const apiUrl = new URL('/api/ar-glb', window.location.origin)
		apiUrl.searchParams.set('url', originalUrl)
		return apiUrl.toString()
	}

	function detectDevice() {
		const userAgent = navigator.userAgent

		if (/iPad|iPhone|iPod/.test(userAgent)) {
			deviceType = 'ios'
			// iOS Quick Look requires USDZ file for reliable AR support
			showButton = !!usdzUrl
			return
		}

		if (/Android/.test(userAgent)) {
			deviceType = 'android'
			// On Android, only show this button if WebXR is NOT available
			// (WebXR button takes priority when available)
			showButton = !!glbUrl && !webxrAvailable
			return
		}

		deviceType = 'desktop'
		showButton = false
	}

	function handleARClick() {
		// Show scale info popup if model is scaled
		if (arScaling?.isScaled) {
			showScaleInfo = true
			setTimeout(() => {
				showScaleInfo = false
			}, 4000)
		}

		if (deviceType === 'ios' && arLink) {
			arLink.click()
		} else if (deviceType === 'android' && glbUrl) {
			// Use the scaled GLB URL for Android Scene Viewer
			const scaledUrl = getScaledGlbUrl(glbUrl)
			openAndroidSceneViewer(scaledUrl)
		}
	}

	function openAndroidSceneViewer(url: string) {
		const titleElement = document.querySelector('h1')
		const title = titleElement?.textContent || 'AR Model'

		// For scaled models, disable resizing to maintain correct proportions
		const resizable = arScaling?.isScaled ? 'false' : 'true'

		const intentUrl = `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(url)}&mode=ar_preferred&title=${encodeURIComponent(title)}&resizable=${resizable}#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=https://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(url)}&mode=ar_preferred;end;`

		window.location.href = intentUrl
	}

	onMount(() => {
		detectDevice()
	})

	// Re-detect when WebXR availability changes
	$effect(() => {
		if (webxrAvailable !== undefined) {
			detectDevice()
		}
	})
</script>

{#if showButton}
	{#if deviceType === 'ios'}
		<a
			bind:this={arLink}
			href={usdzUrl}
			rel="ar"
			style="display: none;"
			aria-label="View USDZ model in AR"
		>
			<img alt="AR Model" />
		</a>
	{/if}
	<div class="absolute bottom-4 right-4" style="z-index: 99999;">
		<!-- Scale info tooltip for large models -->
		{#if showScaleInfo && arScaling?.isScaled && modelDimensions}
			<div
				class="absolute bottom-16 right-0 w-64 rounded-lg bg-white p-3 shadow-xl border border-slate-200 text-left"
				role="tooltip"
			>
				<div class="flex items-start gap-2">
					<Icon icon="tabler:info-circle" class="size-5 text-sky-600 flex-shrink-0 mt-0.5" />
					<div>
						<p class="text-xs font-medium text-slate-800 mb-1">
							Maßstab: {formatScalePercentage(arScaling.scaleFactor)}
						</p>
						<p class="text-[10px] text-slate-600">
							Original: {formatDimensions(arScaling.originalDimensions)}
						</p>
						<p class="text-[10px] text-slate-600">
							AR-Anzeige: {formatDimensions(arScaling.scaledDimensions)}
						</p>
					</div>
				</div>
			</div>
		{/if}

		<button
			class="ar-button flex size-12 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-lg backdrop-blur-sm transition-all hover:bg-white hover:shadow-xl"
			onclick={handleARClick}
			aria-label="View in Augmented Reality"
			title={arScaling?.isScaled
				? `View in AR (scaled to ${formatScalePercentage(arScaling.scaleFactor)})`
				: 'View in AR'}
			type="button"
		>
			<Icon icon="tabler:augmented-reality" class="size-6" aria-hidden="true" />
			{#if arScaling?.isScaled}
				<span class="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-sky-500 text-[8px] font-bold text-white">
					S
				</span>
			{/if}
		</button>
	</div>
{/if}

<style>
	.ar-button {
		-webkit-tap-highlight-color: transparent;
	}
</style>

