import { filterZenodoRecord } from '$lib/utils'
import type { PageServerLoad } from './$types'

export const load = (async ({ params, fetch }) => {
	const { id } = params

	// Handle custom records
	if (id === 'custom-3d11b-env7') {
		const record = {
			id: 'custom-3d11b-env7',
			created: new Date().toISOString(),
			updated: new Date().toISOString(),
			title: '3D11b-Env 7',
			keywords: ['GLB', '3D Model'],
			version: '1.0',
			glb: 'https://venerisintelligence.uk/models/3D11b-Env%207.glb',
			glbSize: 0, // Unknown size
			status: 'published',
			stats: {
				downloads: 0,
				views: 0
			}
		}
		return {
			result: record
		}
	}

	const url = `https://zenodo.org/api/records/${id}`

	try {
		const response = await fetch(url)
		if (!response.ok) {
			throw new Error(`HTTP error: ${response.status}`)
		}
		const result = await response.json()
		const record = filterZenodoRecord(result)

		return {
			result: record
		}
	} catch (error) {
		return { error: `${(error as Error).message}` }
	}
}) satisfies PageServerLoad
