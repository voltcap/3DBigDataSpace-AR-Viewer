/**
 * GLB Scaling Service
 * 
 * Server-side service for scaling GLB models for AR display.
 * Uses gltf-transform to modify the model's root node scale.
 * 
 * IMPORTANT: This modifies the GLB for AR display only.
 * Original files on Zenodo remain unchanged.
 */

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds } from '@gltf-transform/functions'
import { AR_MAX_DIMENSION_METERS } from '$lib/utils/arScaling'

export interface ScalingResult {
	/** The scaled GLB as a Uint8Array */
	glbData: Uint8Array
	/** The scaling factor that was applied */
	scaleFactor: number
	/** Whether scaling was actually applied */
	wasScaled: boolean
	/** Original dimensions in meters */
	originalDimensions: { width: number; height: number; depth: number }
	/** Scaled dimensions in meters */
	scaledDimensions: { width: number; height: number; depth: number }
}

export interface ScalingOptions {
	/** Maximum dimension in meters (default: 2.0) */
	maxDimension?: number
	/** Whether to force scaling even if model is smaller than max */
	forceScale?: boolean
	/** Custom scale factor to apply (overrides automatic calculation) */
	customScaleFactor?: number
}

// In-memory cache for scaled GLB files
// Key: original URL + scale factor, Value: scaled GLB data
const scaledGlbCache = new Map<string, { data: Uint8Array; timestamp: number; result: ScalingResult }>()

// Cache TTL: 1 hour
const CACHE_TTL_MS = 60 * 60 * 1000

/**
 * Generates a cache key for a scaled GLB
 */
function getCacheKey(url: string, maxDimension: number): string {
	return `${url}:${maxDimension}`
}

/**
 * Cleans up expired cache entries
 */
function cleanupCache(): void {
	const now = Date.now()
	for (const [key, value] of scaledGlbCache.entries()) {
		if (now - value.timestamp > CACHE_TTL_MS) {
			scaledGlbCache.delete(key)
		}
	}
}

/**
 * Downloads a GLB file from a URL
 */
async function downloadGlb(url: string): Promise<Uint8Array> {
	const response = await fetch(url, {
		headers: {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
			'Accept': 'application/octet-stream, */*',
			'Referer': 'https://venerisintelligence.uk/'
		}
	})

	if (!response.ok) {
		throw new Error(`Failed to download GLB: ${response.status} ${response.statusText}`)
	}

	const arrayBuffer = await response.arrayBuffer()
	return new Uint8Array(arrayBuffer)
}

/**
 * Scales a GLB model for AR display
 * 
 * @param glbUrl - URL of the original GLB file
 * @param options - Scaling options
 * @returns ScalingResult with the scaled GLB data and metadata
 */
export async function scaleGlbForAR(
	glbUrl: string,
	options: ScalingOptions = {}
): Promise<ScalingResult> {
	const maxDimension = options.maxDimension ?? AR_MAX_DIMENSION_METERS
	const cacheKey = getCacheKey(glbUrl, maxDimension)

	// Check cache first
	const cached = scaledGlbCache.get(cacheKey)
	if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
		console.log(`[GLB Scaler] Cache hit for ${glbUrl}`)
		return cached.result
	}

	// Cleanup old cache entries periodically
	if (scaledGlbCache.size > 50) {
		cleanupCache()
	}

	console.log(`[GLB Scaler] Processing ${glbUrl}`)

	// Download the original GLB
	const glbData = await downloadGlb(glbUrl)

	// Initialize gltf-transform I/O
	const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

	// Read the GLB document
	const document = await io.readBinary(glbData)

	// Get the scene bounds
	const scene = document.getRoot().getDefaultScene() || document.getRoot().listScenes()[0]
	if (!scene) {
		throw new Error('GLB has no scene')
	}

	const bounds = getBounds(scene)
	const originalWidth = bounds.max[0] - bounds.min[0]
	const originalHeight = bounds.max[1] - bounds.min[1]
	const originalDepth = bounds.max[2] - bounds.min[2]

	const originalDimensions = {
		width: originalWidth,
		height: originalHeight,
		depth: originalDepth
	}

	// Calculate the largest dimension
	const largestDimension = Math.max(originalWidth, originalHeight, originalDepth)

	// Determine if scaling is needed
	let scaleFactor: number
	let wasScaled: boolean

	if (options.customScaleFactor !== undefined) {
		scaleFactor = options.customScaleFactor
		wasScaled = scaleFactor !== 1.0
	} else if (largestDimension > maxDimension || options.forceScale) {
		scaleFactor = maxDimension / largestDimension
		wasScaled = true
	} else {
		scaleFactor = 1.0
		wasScaled = false
	}

	const scaledDimensions = {
		width: originalWidth * scaleFactor,
		height: originalHeight * scaleFactor,
		depth: originalDepth * scaleFactor
	}

	// Apply scaling if needed
	if (wasScaled) {
		// Apply scale to all root nodes in the scene
		for (const node of scene.listChildren()) {
			const currentScale = node.getScale()
			node.setScale([
				currentScale[0] * scaleFactor,
				currentScale[1] * scaleFactor,
				currentScale[2] * scaleFactor
			])
		}

		console.log(`[GLB Scaler] Scaled by factor ${scaleFactor.toFixed(4)}: ` +
			`${originalWidth.toFixed(2)}m × ${originalHeight.toFixed(2)}m × ${originalDepth.toFixed(2)}m → ` +
			`${scaledDimensions.width.toFixed(2)}m × ${scaledDimensions.height.toFixed(2)}m × ${scaledDimensions.depth.toFixed(2)}m`)
	}

	// Write the modified GLB
	const outputGlb = await io.writeBinary(document)

	const result: ScalingResult = {
		glbData: outputGlb,
		scaleFactor,
		wasScaled,
		originalDimensions,
		scaledDimensions
	}

	// Cache the result
	scaledGlbCache.set(cacheKey, {
		data: outputGlb,
		timestamp: Date.now(),
		result
	})

	return result
}

/**
 * Gets cache statistics
 */
export function getCacheStats(): { size: number; keys: string[] } {
	return {
		size: scaledGlbCache.size,
		keys: Array.from(scaledGlbCache.keys())
	}
}

/**
 * Clears the cache
 */
export function clearCache(): void {
	scaledGlbCache.clear()
}

