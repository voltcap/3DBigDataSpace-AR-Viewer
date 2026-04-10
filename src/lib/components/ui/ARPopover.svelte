<script lang="ts">
	import { onMount } from 'svelte'
	import Icon from '@iconify/svelte'
	import QRCode from 'qrcode'
	import {
		calculateARScaling,
		formatScalePercentage,
		formatDimensions,
		type ModelDimensions,
		type ARScalingResult
	} from '$lib/utils/arScaling'

	let { glbUrl, usdzUrl, modelDimensions }: {
		glbUrl?: string;
		usdzUrl?: string;
		modelDimensions?: ModelDimensions;
	} = $props()

	let showPopover = $state(false)
	let isDesktop = $state(false)
	let deviceType: 'ios' | 'android' | 'desktop' = $state('desktop')
	let qrCodeDataUrl = $state('')
	let currentUrl = $state('')
	let arLink: HTMLAnchorElement | null = $state(null)

	// Calculate AR scaling based on model dimensions
	let arScaling = $derived<ARScalingResult | null>(
		modelDimensions ? calculateARScaling(modelDimensions) : null
	)

	function detectDevice() {
		const userAgent = navigator.userAgent

		if (/iPad|iPhone|iPod/.test(userAgent)) {
			deviceType = 'ios'
			isDesktop = false
			return
		}

		if (/Android/.test(userAgent)) {
			deviceType = 'android'
			isDesktop = false
			return
		}

		deviceType = 'desktop'
		isDesktop = true
	}

	function togglePopover() {
		showPopover = !showPopover
	}

	async function generateQRCode() {
		if (typeof window !== 'undefined') {
			currentUrl = window.location.href
			try {
				qrCodeDataUrl = await QRCode.toDataURL(currentUrl, {
					width: 200,
					margin: 2,
					color: {
						dark: '#1e293b',
						light: '#ffffff'
					}
				})
			} catch (err) {
				console.error('Failed to generate QR code:', err instanceof Error ? err.message : err)
			}
		}
	}

	function closePopover() {
		showPopover = false
	}

	/**
	 * Generates the URL for the scaled GLB via our API endpoint.
	 */
	function getScaledGlbUrl(originalUrl: string): string {
		if (!arScaling?.isScaled) {
			return originalUrl
		}
		const apiUrl = new URL('/api/ar-glb', window.location.origin)
		apiUrl.searchParams.set('url', originalUrl)
		return apiUrl.toString()
	}

	function handleARClick() {
		if (deviceType === 'ios' && arLink && usdzUrl) {
			arLink.click()
		} else if (deviceType === 'android' && glbUrl) {
			const scaledUrl = getScaledGlbUrl(glbUrl)
			openAndroidSceneViewer(scaledUrl)
		}
		closePopover()
	}

	function openAndroidSceneViewer(url: string) {
		const titleElement = document.querySelector('h1')
		const title = titleElement?.textContent || 'AR Model'
		const resizable = arScaling?.isScaled ? 'false' : 'true'

		const intentUrl = `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(url)}&mode=ar_preferred&title=${encodeURIComponent(title)}&resizable=${resizable}#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=https://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(url)}&mode=ar_preferred;end;`

		window.location.href = intentUrl
	}

	onMount(() => {
		detectDevice()
		if (isDesktop) {
			generateQRCode()
		}
	})

	// iOS Quick Look requires USDZ file for reliable AR support
	let iosSupported = $derived(!!usdzUrl)
	let androidSupported = $derived(!!glbUrl)
	let hasARFile = $derived.by(() => {
		if (deviceType === 'ios') return iosSupported
		if (deviceType === 'android') return androidSupported
		return false
	})
</script>

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
	<!-- Button -->
	<button
		class="flex size-12 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-lg backdrop-blur-sm transition-all hover:bg-white hover:shadow-xl"
		onclick={togglePopover}
		aria-label="View AR on mobile"
		title="AR auf Smartphone"
		type="button"
	>
		<Icon icon="tabler:augmented-reality-2" class="size-6" aria-hidden="true" />
	</button>

	<!-- Popover -->
	{#if showPopover}
		<div
			class="absolute bottom-16 right-0 w-80 rounded-lg bg-white p-4 shadow-xl border border-slate-200"
			role="dialog"
			aria-modal="false"
		>
			<button
				class="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
				onclick={closePopover}
				aria-label="Close"
			>
				<Icon icon="tabler:x" class="size-4" />
			</button>

			<div class="text-center">
				<div class="mb-3 flex justify-center">
					<Icon icon="tabler:device-mobile" class="size-10 text-sky-600" />
				</div>

				<h3 class="mb-2 text-lg font-bold text-slate-800">
					AR auf dem Smartphone
				</h3>

				<!-- Mobile: Start AR Button -->
				{#if !isDesktop}
					{#if !hasARFile}
						<div class="mb-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
							<div class="flex items-start gap-2">
								<Icon icon="tabler:alert-circle" class="size-5 text-amber-600 flex-shrink-0 mt-0.5" />
								<div class="text-left">
									<p class="text-xs font-medium text-amber-800">
										Keine kompatible AR-Datei verfügbar
									</p>
									<p class="text-[10px] text-amber-700 mt-1">
										{#if deviceType === 'ios'}
											Für iOS wird eine USDZ-Datei benötigt
										{:else if deviceType === 'android'}
											Für Android wird eine GLB-Datei benötigt
										{/if}
									</p>
								</div>
							</div>
						</div>
					{/if}

					<button
						class="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition-all {hasARFile
							? 'bg-sky-600 text-white hover:bg-sky-700 active:bg-sky-800'
							: 'bg-slate-200 text-slate-400 cursor-not-allowed'}"
						onclick={handleARClick}
						disabled={!hasARFile}
						type="button"
					>
						<Icon icon="tabler:augmented-reality" class="size-5" />
						<span>Start AR</span>
					</button>

					<div class="mt-3 pt-3 border-t border-slate-200">
						<p class="text-[10px] text-slate-500">
							{#if deviceType === 'ios'}
								<Icon icon="tabler:brand-apple" class="inline size-3 mr-1" />
								iOS AR Quick Look
							{:else if deviceType === 'android'}
								<Icon icon="tabler:brand-android" class="inline size-3 mr-1" />
								Android Scene Viewer
							{/if}
						</p>
					</div>
				{/if}

				<!-- Desktop: QR Code section -->
				{#if isDesktop}
					<p class="mb-3 text-xs text-slate-600">
						Scannen Sie den QR-Code mit Ihrem Smartphone
					</p>

					{#if qrCodeDataUrl}
						<div class="mb-3 flex justify-center">
							<img src={qrCodeDataUrl} alt="QR Code" class="rounded-lg border-2 border-slate-200" style="width: 160px; height: 160px;" />
						</div>
					{/if}
				{/if}

				<!-- Desktop: Supported devices section -->
				{#if isDesktop}
					<div class="text-left">
						<p class="text-xs font-semibold text-slate-700 mb-1.5">Unterstützte Geräte:</p>

						<div class="flex gap-1.5">
							<!-- iOS Card -->
							<div class="flex-1 flex flex-col items-center gap-1.5 rounded-lg bg-slate-50 p-2 {iosSupported ? '' : 'opacity-50'}">
								<Icon
									icon="tabler:brand-apple"
									class="size-7 {iosSupported ? 'text-slate-700' : 'text-slate-400'}"
								/>
								<p class="text-[10px] font-medium text-center {iosSupported ? 'text-slate-800' : 'text-slate-500 line-through'}">
									iOS
								</p>
							</div>

							<!-- Android Card -->
							<div class="flex-1 flex flex-col items-center gap-1.5 rounded-lg bg-slate-50 p-2 {androidSupported ? '' : 'opacity-50'}">
								<Icon
									icon="tabler:brand-android"
									class="size-7 {androidSupported ? 'text-slate-700' : 'text-slate-400'}"
								/>
								<p class="text-[10px] font-medium text-center {androidSupported ? 'text-slate-800' : 'text-slate-500 line-through'}">
									Android
								</p>
							</div>
						</div>
					</div>
				{/if}

				<!-- AR Scaling Info for large models - visible on all devices -->
				{#if arScaling?.isScaled && modelDimensions}
					<div class="mt-3 rounded-lg bg-sky-50 p-2 border border-sky-200 text-left">
						<div class="flex items-start gap-2">
							<Icon icon="tabler:resize" class="size-4 text-sky-600 flex-shrink-0 mt-0.5" />
							<div>
								<p class="text-xs font-medium text-sky-800">
									AR-Skalierung: {formatScalePercentage(arScaling.scaleFactor)}
								</p>
								<p class="text-[10px] text-sky-700 mt-1">
									Originalgröße: {formatDimensions(arScaling.originalDimensions)}
								</p>
								<p class="text-[10px] text-sky-700">
									AR-Anzeige: {formatDimensions(arScaling.scaledDimensions)}
								</p>
								{#if isDesktop && (androidSupported || iosSupported)}
									<div class="mt-2 pt-2 border-t border-sky-200">
										{#if androidSupported}
											<p class="text-[10px] text-sky-700 flex items-center gap-1">
												<Icon icon="tabler:brand-android" class="size-3" />
												<span class="font-medium">Android:</span> Automatisch skaliert
											</p>
										{/if}
										{#if iosSupported}
											<p class="text-[10px] text-sky-600 flex items-center gap-1">
												<Icon icon="tabler:brand-apple" class="size-3" />
												<span class="font-medium">iOS:</span> Originalgröße (USDZ)
											</p>
										{/if}
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

