import { filterZenodoRecord } from '$lib/utils'

async function getZenodoRecords({
	title,
	size = '10',
	page = '1',
	sort = 'bestmatch',
	fetch
}: {
	title?: string
	size?: string
	page?: string
	sort?: string
	fetch: typeof globalThis.fetch
}) {
	const baseUrl = 'https://zenodo.org/api/records'

	const creator = 'Junior Professorship for Digital Humanities'
	const queryParts = [`metadata.creators.person_or_org.name:"${creator}"`]
	title && queryParts.push(`title:"${title}"`)
	const query = queryParts.join(' AND ')

	const params = new URLSearchParams({
		q: query,
		page,
		size,
		sort,
		type: 'dataset'
	})

	const url = `${baseUrl}?${params.toString()}`

	try {
		const response = await fetch(url)
		if (!response.ok) {
			throw new Error(`HTTP error: ${response.status}`)
		}
		const result = await response.json()

		const total = result?.hits?.total
		const hits = result?.hits?.hits.map((record: any) => filterZenodoRecord(record))

		return {
			hits,
			total,
			result
		}
	} catch (error) {
		throw new Error(`${(error as Error).message}`)
	}
}

export const load = async ({ url, fetch }: { url: URL; fetch: typeof globalThis.fetch }) => {
	const { title, size, page, sort } = Object.fromEntries(url.searchParams)
	try {
		const records = await getZenodoRecords({
			title,
			size,
			page,
			sort,
			fetch
		})

		// Add the custom GLB model
		const customRecord = {
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

		records.hits.unshift(customRecord)

		return {
			result: records
		}
	} catch (error) {
		return { error: `${(error as Error).message}` }
	}
}
