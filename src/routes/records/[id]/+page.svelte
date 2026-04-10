<script lang="ts">
	import type { PageProps } from './$types'
	import Viewer from '$lib/components/ui/Viewer.svelte'
	import Footer from '$lib/components/ui/Footer.svelte'
	import Header from '$lib/components/ui/Header.svelte'
	import RecordSidebar from '$lib/components/ui/RecordSidebar.svelte'
	import Icon from '@iconify/svelte'
	import { goto } from '$app/navigation'
	import { navigateBackToRecords, loadRecordsState } from '$lib/stores/recordsState'
	import { onMount } from 'svelte'

	let { data }: PageProps = $props()
	let { result, error } = data

	let savedState = $state<any>(null)

	function getScaledGlbUrl(originalUrl: string): string {
		const apiUrl = new URL('/api/ar-glb', window.location.origin)
		apiUrl.searchParams.set('url', originalUrl)
		return apiUrl.toString()
	}

	onMount(() => {
		savedState = loadRecordsState()
	})

	function handleBackToRecords() {
		const backUrl = navigateBackToRecords()
		goto(backUrl)

		if (savedState?.scrollPosition) {
			setTimeout(() => {
				window.scrollTo(0, savedState.scrollPosition)
			}, 100)
		}
	}
</script>

<svelte:head>
	<title>{result?.title || 'Record'} - 3DBigDataSpace</title>
	<meta name="description" content="Explore {result?.title || 'this cultural heritage artifact'} in immersive 3D. View this cultural heritage artifact from the 3DBigDataSpace collection with interactive 3D visualization and AR support." />
	<meta property="og:title" content="{result?.title || 'Record'} - 3DBigDataSpace" />
	<meta property="og:description" content="Explore {result?.title || 'this cultural heritage artifact'} in immersive 3D. View this cultural heritage artifact from the 3DBigDataSpace collection with interactive 3D visualization and AR support." />
	<meta property="og:type" content="website" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="{result?.title || 'Record'} - 3DBigDataSpace" />
	<meta name="twitter:description" content="Explore {result?.title || 'this cultural heritage artifact'} in immersive 3D. View this cultural heritage artifact from the 3DBigDataSpace collection with interactive 3D visualization and AR support." />
</svelte:head>

<Header>
	{#snippet middle()}
		<h1 class="text-2xl font-light">{result?.title || 'Record'}</h1>
	{/snippet}

	<button
		class="flex items-center gap-1 text-slate-400 hover:text-sky-500 cursor-pointer whitespace-nowrap"
		onclick={handleBackToRecords}
		title={savedState ? `Back to Records (Page ${savedState.pageNumber}${savedState.filterName ? `, Search: "${savedState.filterName}"` : ''})` : 'Back to Records'}
	>
		<Icon icon="tabler:chevron-left" class="size-4 md:size-5" />
		<span class="hidden sm:inline">
			{#if savedState && (savedState.pageNumber > 1 || savedState.filterName)}
				Back to Results
			{:else}
				Back to Records
			{/if}
		</span>
		<span class="sm:hidden">Back</span>
	</button>
</Header>

{#if error}
	<div class="flex h-full w-full flex-auto items-center justify-center">
		<div class="text-center">
			<Icon icon="tabler:alert-circle" class="mx-auto mb-4 size-16 text-red-500" />
			<h2 class="mb-2 text-xl font-semibold text-slate-800">Record Not Found</h2>
			<p class="mb-4 text-slate-600">{error}</p>
			<button
				class="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition-colors cursor-pointer"
				onclick={handleBackToRecords}
			>
				Back to Records
			</button>
		</div>
	</div>
{:else if result}
	<div class="relative flex h-full w-full flex-auto overflow-hidden">
		<RecordSidebar record={result} />

		<div class="flex-1 relative">
			{#if result.glb}
				<Viewer file={result.glb} usdzFile={result.usdz} />
			{:else}
				<div class="flex h-full w-full items-center justify-center bg-gradient-to-b from-slate-50 to-slate-300">
					<div class="text-center max-w-md px-6">
						<Icon icon="tabler:file-3d" class="mx-auto mb-4 size-16 text-slate-400" />
						<h3 class="mb-2 text-lg font-semibold text-slate-800">No 3D Model Available</h3>
						<p class="text-slate-600">This record does not contain a 3D model file (.glb).</p>
					</div>
				</div>
			{/if}
		</div>
	</div>
{:else}
	<div class="flex h-full w-full flex-auto items-center justify-center">
		<div class="text-center">
			<Icon icon="tabler:loader-2" class="mx-auto mb-4 size-16 animate-spin text-blue-500" />
			<p class="text-slate-600">Loading record...</p>
		</div>
	</div>
{/if}

<Footer />
