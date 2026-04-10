/**
 * AR GLB Scaling API Endpoint
 * 
 * Fetches a GLB file from Zenodo, scales it for AR display (max 2m on any axis),
 * and serves the scaled version. Results are cached to avoid re-processing.
 * 
 * Query Parameters:
 * - url: The original GLB file URL (required)
 * - maxDimension: Maximum dimension in meters (optional, default: 2.0)
 * 
 * Response Headers include scaling metadata:
 * - X-AR-Scale-Factor: The scaling factor applied
 * - X-AR-Was-Scaled: Whether scaling was applied (true/false)
 * - X-AR-Original-Dimensions: Original dimensions in meters (WxHxD)
 * - X-AR-Scaled-Dimensions: Scaled dimensions in meters (WxHxD)
 */

import { error } from '@sveltejs/kit'
import type { RequestEvent } from '@sveltejs/kit'
import { scaleGlbForAR } from '$lib/services/glbScaler'
import { AR_MAX_DIMENSION_METERS } from '$lib/utils/arScaling'

// Allowed domains for GLB files
const ALLOWED_DOMAINS = [
	'zenodo.org',
	'files.zenodo.org',
	'venerisintelligence.uk'
]

export async function GET({ url }: RequestEvent) {
	const glbUrl = url.searchParams.get('url')
	const maxDimensionParam = url.searchParams.get('maxDimension')

	if (!glbUrl) {
		throw error(400, 'Missing url parameter')
	}

	// Validate URL
	let parsedUrl: URL
	try {
		parsedUrl = new URL(glbUrl)
	} catch {
		throw error(400, 'Invalid URL')
	}

	// Check if domain is allowed
	const isAllowed = ALLOWED_DOMAINS.some(domain =>
		parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`)
	)

	if (!isAllowed) {
		throw error(403, `Domain ${parsedUrl.hostname} is not allowed. Only Zenodo URLs are supported.`)
	}

	// Validate file extension
	if (!parsedUrl.pathname.toLowerCase().endsWith('.glb')) {
		throw error(400, 'URL must point to a .glb file')
	}

	// Parse max dimension
	let maxDimension = AR_MAX_DIMENSION_METERS
	if (maxDimensionParam) {
		const parsed = parseFloat(maxDimensionParam)
		if (isNaN(parsed) || parsed <= 0 || parsed > 100) {
			throw error(400, 'maxDimension must be a positive number between 0 and 100')
		}
		maxDimension = parsed
	}

	try {
		const result = await scaleGlbForAR(glbUrl, { maxDimension })

		// Format dimensions for headers
		const formatDim = (d: { width: number; height: number; depth: number }) =>
			`${d.width.toFixed(3)}x${d.height.toFixed(3)}x${d.depth.toFixed(3)}`

		return new Response(result.glbData as unknown as BodyInit, {
			status: 200,
			headers: {
				'Content-Type': 'model/gltf-binary',
				'Content-Disposition': 'inline; filename="model-ar-scaled.glb"',
				'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
				'Access-Control-Allow-Origin': '*',
				// Custom headers with scaling metadata
				'X-AR-Scale-Factor': result.scaleFactor.toFixed(6),
				'X-AR-Was-Scaled': result.wasScaled.toString(),
				'X-AR-Original-Dimensions': formatDim(result.originalDimensions),
				'X-AR-Scaled-Dimensions': formatDim(result.scaledDimensions)
			}
		})
	} catch (err) {
		console.error('[AR GLB API] Error processing GLB:', err)

		if (err instanceof Error) {
			if (err.message.includes('Failed to download')) {
				throw error(502, `Failed to fetch GLB from source: ${err.message}`)
			}
			if (err.message.includes('no scene')) {
				throw error(422, 'GLB file has no valid scene')
			}
		}

		throw error(500, `Failed to process GLB: ${err instanceof Error ? err.message : 'Unknown error'}`)
	}
}

/**
 * Handle OPTIONS for CORS preflight
 */
export async function OPTIONS() {
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
			'Access-Control-Max-Age': '86400'
		}
	})
}

