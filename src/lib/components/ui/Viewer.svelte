<script lang="ts">
	import { onMount } from 'svelte'
	import Icon from '@iconify/svelte'

	import '@babylonjs/core/Helpers/sceneHelpers'
	import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_texture_transform'
	import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_draco_mesh_compression'
	import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_mesh_quantization'
	import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_pbrSpecularGlossiness'
	import '@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp'
	import '@babylonjs/loaders/glTF/2.0/glTFLoader'
	import '@babylonjs/core/Shaders/rgbdDecode.fragment'

	import environment from '$lib/assets/environment.env?url'

	import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
	import { Engine } from '@babylonjs/core/Engines/engine'
	import { Scene } from '@babylonjs/core/scene'
	import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader'
	import { Vector3 } from '@babylonjs/core/Maths/math.vector'
	import { BoundingBox } from '@babylonjs/core/Culling/boundingBox'
	import type { AssetContainer } from '@babylonjs/core/assetContainer'
	import { Color4 } from '@babylonjs/core/Maths/math.color'
	import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture'
	import type { WebXRDefaultExperience } from '@babylonjs/core/XR/webXRDefaultExperience'
	import { WebXRState } from '@babylonjs/core/XR/webXRTypes'

	import { DracoCompression } from '@babylonjs/core/Meshes/Compression/dracoCompression'

	import AnnotationTooltip from './AnnotationTooltip.svelte'
	import ArButton from './ARButton.svelte'
	import ARPopover from './ARPopover.svelte'
	import WebXRButton from './WebXRButton.svelte'

	import { AnnotationRenderer } from '$lib/services/annotationRenderer'
	import { parseMETSXML, createSampleAnnotations, loadIIIFAnnotationsForRecord } from '../../../services/xmlParser'
	import type { Annotation3D, AnnotationEvent } from '$lib/types/annotations'
	import { iiifToAnnotation3D } from '$lib/types/annotations'
	import type { ModelDimensions } from '$lib/utils/arScaling'
	import { detectWebXRSupport, createWebXRExperience, type WebXRSupport } from '$lib/utils/webxr'

	let canvas: HTMLCanvasElement | null = null

	let engine: Engine | null = null
	let scene: Scene | null = $state(null)
	let camera: ArcRotateCamera | null = null
	let container: AssetContainer | null = null

	let isLoading = $state(true)
	let loadingProgress = $state(0)
	let error = $state('')
	let isInitialized = $state(false)

	// Model dimensions for AR scaling (in meters, as per glTF spec: 1 unit = 1 meter)
	let modelDimensions = $state<ModelDimensions | undefined>(undefined)

	// WebXR support and state
	let webxrSupport = $state<WebXRSupport | null>(null)
	let webxrExperience: WebXRDefaultExperience | null = null
	let isInXR = $state(false)

	let annotationRenderer: AnnotationRenderer | null = null
	let hoveredAnnotation = $state<Annotation3D | null>(null)
	let tooltipPosition = $state({ x: 0, y: 0 })
	let tooltipVisible = $state(false)

	let { file, usdzFile, enableAnnotations = true, annotationsUrl = undefined }: {
		file: string;
		usdzFile?: string;
		enableAnnotations?: boolean;
		annotationsUrl?: string;
	} = $props()

	function init() {
		try {
			if (!canvas) return
			engine = new Engine(canvas, true, {
				preserveDrawingBuffer: true,
				stencil: true,
				antialias: true,
				adaptToDeviceRatio: true
			})
			scene = new Scene(engine)
			// Configure Draco decoder
			DracoCompression.Configuration.decoder = {
				wasmUrl: 'https://cdn.babylonjs.com/draco_wasm_wrapper_gltf.js',
				wasmBinaryUrl: 'https://cdn.babylonjs.com/draco_decoder_gltf.wasm',
				fallbackUrl: 'https://cdn.babylonjs.com/draco_decoder_gltf.js'
			}
			camera = new ArcRotateCamera('camera', 0, 0, 0, new Vector3(0, 0, 0), scene)
			camera.attachControl(canvas, true)
			isInitialized = true
		} catch (err) {
			console.error('Failed to initialize 3D engine:', err)
			error = 'Failed to initialize 3D viewer. Please try refreshing the page.'
			isLoading = false
		}
	}

	/**
	 * Initialize WebXR support detection and setup
	 * This runs after the scene is created to check for WebXR capabilities
	 */
	async function initializeWebXR() {
		if (!scene) return

		try {
			// Detect WebXR support
			webxrSupport = await detectWebXRSupport()

			if (webxrSupport.supportsAR) {
				console.log('WebXR AR is supported on this device')

				// Create WebXR experience with hit-test and anchors
				webxrExperience = await createWebXRExperience(scene, {
					enableHitTest: true,
					enableAnchors: true,
					enableDomOverlay: false
				})

				if (webxrExperience) {
					// Listen for XR state changes
					webxrExperience.baseExperience.onStateChangedObservable.add((state) => {
						isInXR = state === WebXRState.IN_XR

						if (state === WebXRState.IN_XR) {
							console.log('Entered WebXR AR mode')
						} else if (state === WebXRState.EXITING_XR) {
							console.log('Exiting WebXR AR mode')
						}
					})
				}
			} else {
				console.log('WebXR AR not supported:', webxrSupport.browserName, 'on', webxrSupport.isAndroid ? 'Android' : webxrSupport.isIOS ? 'iOS' : 'Desktop')
			}
		} catch (err) {
			console.error('Failed to initialize WebXR:', err)
			// Don't set error state - WebXR is optional enhancement
		}
	}

	/**
	 * Enter WebXR AR mode
	 * This function is called by the AR button when WebXR is available
	 */
	export async function enterWebXR() {
		if (!webxrExperience) {
			console.warn('WebXR experience not initialized')
			return false
		}

		try {
			// Enter immersive AR session
			await webxrExperience.baseExperience.enterXRAsync('immersive-ar', 'local-floor')
			return true
		} catch (err) {
			console.error('Failed to enter WebXR:', err)
			return false
		}
	}

	/**
	 * Exit WebXR AR mode
	 */
	export async function exitWebXR() {
		if (!webxrExperience) return

		try {
			await webxrExperience.baseExperience.exitXRAsync()
		} catch (err) {
			console.error('Failed to exit WebXR:', err)
		}
	}

	function initializeAnnotationSystem() {
		if (!scene || !camera || !enableAnnotations) return

		try {
			annotationRenderer = new AnnotationRenderer(scene, camera, {
				enableInteraction: true,
				enableTooltips: true,
				scaleWithDistance: true
			})

			annotationRenderer.onAnnotationEvent('click', handleAnnotationClick)

			const source = annotationsUrl ? 'JSON' : 'XML'
			console.log(`Annotation system initialized, loading from ${source}`)

			if (annotationsUrl) {
				loadAnnotationsFromJSON(annotationsUrl)
			} else {
				loadAnnotationsFromXML()
			}
		} catch (err) {
			console.error('Failed to initialize annotation system:', err)
		}
	}

	function start() {
		try {
			engine?.runRenderLoop(() => {
				scene?.render()
				annotationRenderer?.update()
			})
			resizeObserver()
		} catch (err) {
			console.error('Failed to start render loop:', err)
			error = 'Failed to start 3D rendering. Please try refreshing the page.'
			isLoading = false
		}
	}

	async function loadAsset(file: string, fileType: string = 'glb') {
		const TIMEOUT_MS = 30000
		let timeoutId: number | undefined
		let lastLoggedProgress = 0

		try {
			if (!engine || !scene) {
				throw new Error('3D engine not initialized')
			}

			isLoading = true
			loadingProgress = 0
			error = ''

			console.log('Loading 3D model from:', file)

			const timeoutPromise = new Promise<never>((_, reject) => {
				timeoutId = window.setTimeout(() => {
					reject(new Error('timeout'))
				}, TIMEOUT_MS)
			})

			const loadPromise = LoadAssetContainerAsync(file, scene, {
				onProgress: (evt) => {
					if (evt.lengthComputable) {
						loadingProgress = (evt.loaded * 100) / evt.total
						// Only log at 25% intervals to reduce console noise
						const currentMilestone = Math.floor(loadingProgress / 25) * 25
						if (currentMilestone > lastLoggedProgress && currentMilestone > 0) {
							console.log(`Loading progress: ${currentMilestone}%`)
							lastLoggedProgress = currentMilestone
						}
					}
				},
				pluginExtension: `.${fileType}`
			})

			container = await Promise.race([loadPromise, timeoutPromise])

			if (timeoutId) clearTimeout(timeoutId)

			if (!container.meshes || container.meshes.length === 0) {
				throw new Error('Model loaded but contains no meshes')
			}

			// Consolidate model loading logs into a single summary
			const totalVertices = container.meshes.reduce((sum, m) => sum + m.getTotalVertices(), 0)
			console.log(`Model loaded successfully: ${container.meshes.length} meshes, ${totalVertices.toLocaleString()} vertices`)

			container.addAllToScene()
			isLoading = false
		} catch (err) {
			if (timeoutId) clearTimeout(timeoutId)

			console.error('Error loading 3D model:', err)
			error = err instanceof Error && err.message === 'timeout'
				? 'Loading timeout - the model took too long to load. Please try again.'
				: `Failed to load 3D model: ${err instanceof Error ? err.message : 'Unknown error'}`
			isLoading = false
		}
	}

	function createEnvironment() {
		if (!scene) return
		const hdrTexture = CubeTexture.CreateFromPrefilteredData(environment, scene)
		scene.environmentTexture = hdrTexture

		scene.createDefaultLight(true)

		scene.createDefaultCamera(true, true, true)
		camera = scene.activeCamera as ArcRotateCamera
		camera.name = 'camera'
		camera.fov = 0.6

		scene.clearColor = Color4.FromHexString('#0000')
	}

	function cleanup() {
		if (container) {
			container.dispose()
		}
		if (annotationRenderer) {
			annotationRenderer.dispose()
			annotationRenderer = null
		}
	}

	async function loadAnnotationsFromJSON(jsonUrl: string) {
		try {
			const response = await fetch(jsonUrl)

			if (!response.ok) {
				throw new Error(`Failed to fetch annotations: ${response.status}`)
			}

			const data = await response.json()

			let iiifAnnotations: any[] = []

			if (Array.isArray(data)) {
				iiifAnnotations = data
			} else if (data.items && Array.isArray(data.items)) {
				iiifAnnotations = data.items
			} else if (data.annotations && Array.isArray(data.annotations)) {
				iiifAnnotations = data.annotations
			} else {
				throw new Error('Invalid annotation JSON format. Expected an array of annotations or an object with "items" or "annotations" property.')
			}

			const newAnnotations: Annotation3D[] = []
			for (const iiifAnnotation of iiifAnnotations) {
				const annotation3D = iiifToAnnotation3D(iiifAnnotation)
				if (annotation3D) {
					newAnnotations.push(annotation3D)
				}
			}

			for (const annotation of newAnnotations) {
				annotationRenderer?.addAnnotation(annotation)
			}

			console.log(`Loaded and displayed ${newAnnotations.length} annotations from JSON`)
		} catch (err) {
			console.error('Failed to load annotations from JSON:', err)
			error = `Failed to load annotations: ${err instanceof Error ? err.message : 'Unknown error'}`
		}
	}

	async function loadAnnotationsFromXML() {
		try {
			const xmlUrl = 'https://zenodo.org/records/17060976/files/68d977cec19c423e869fa911f5ca1a2fmetsmods.xml?download=1'
			const metsRecord = await parseMETSXML(xmlUrl)

			let iiifAnnotations: any[] = []
			let annotationType = 'fallback'

			if (metsRecord) {
				const recordId = '17060976'

				const realAnnotations = await loadIIIFAnnotationsForRecord(recordId)
				if (realAnnotations.length > 0) {
					iiifAnnotations = realAnnotations
					annotationType = 'IIIF'
				} else {
					iiifAnnotations = createSampleAnnotations(metsRecord.glbUrl || file)
					annotationType = 'sample'
				}
			} else {
				iiifAnnotations = createSampleAnnotations(file)
			}

			const newAnnotations: Annotation3D[] = []
			for (const iiifAnnotation of iiifAnnotations) {
				const annotation3D = iiifToAnnotation3D(iiifAnnotation)
				if (annotation3D) {
					newAnnotations.push(annotation3D)
				}
			}

			for (const annotation of newAnnotations) {
				annotationRenderer?.addAnnotation(annotation)
			}

			console.log(`Loaded and displayed ${newAnnotations.length} ${annotationType} annotations from XML`)
		} catch (err) {
			console.error('Failed to load annotations:', err)

			const sampleAnnotations = createSampleAnnotations(file)
			const fallbackAnnotations: Annotation3D[] = []
			for (const iiifAnnotation of sampleAnnotations) {
				const annotation3D = iiifToAnnotation3D(iiifAnnotation)
				if (annotation3D) {
					fallbackAnnotations.push(annotation3D)
				}
			}

			for (const annotation of fallbackAnnotations) {
				annotationRenderer?.addAnnotation(annotation)
			}
		}
	}

	function handleAnnotationClick(event: AnnotationEvent) {
		if (event.screenPosition) {
			tooltipPosition = event.screenPosition
			tooltipVisible = true
			hoveredAnnotation = event.annotation

			setTimeout(() => {
				tooltipVisible = false
				hoveredAnnotation = null
			}, 5000)
		}
	}

	export function resetModelScale() {
		if (!container || !container.meshes.length) return

		container.meshes.forEach(mesh => {
			if (mesh.scaling) {
				mesh.scaling.set(1, 1, 1)
			}
		})

		fitCamera()
	}

	export async function createScene(url: string, fileType: string) {
		cleanup()

		try {
			if (!url) {
				error = 'No 3D model URL provided'
				isLoading = false
				console.error('createScene called without URL')
				return
			}

			console.log('Creating scene with URL:', url, 'fileType:', fileType)
			await loadAsset(url, fileType)

			if (!error) {
				fitCamera()
			}
		} catch (err) {
			console.error('Error creating scene:', err)
			if (!error) {
				error = `Failed to load 3D model: ${err instanceof Error ? err.message : 'Unknown error'}`
			}
			isLoading = false
		}
	}

	export function fitCamera() {
		if (!scene || !container || !camera) {
			console.warn('Cannot fit camera: missing scene, container, or camera')
			return
		}

		if (!container.meshes || container.meshes.length === 0) {
			console.error('Cannot fit camera: container has no meshes')
			error = 'Model loaded but appears to be empty'
			isLoading = false
			return
		}

		try {
			const boundingInfo = container.meshes[0].getHierarchyBoundingVectors()
			const boundingBox = new BoundingBox(boundingInfo.min, boundingInfo.max)
			const center = boundingBox.centerWorld
			const extent = boundingBox.extendSizeWorld

			// Calculate full dimensions (extent is half-size, so multiply by 2)
			// glTF spec: 1 unit = 1 meter
			const fullWidth = extent.x * 2
			const fullHeight = extent.y * 2
			const fullDepth = extent.z * 2

			// Store model dimensions for AR scaling
			modelDimensions = {
				width: fullWidth,
				height: fullHeight,
				depth: fullDepth
			}

			console.log(`Model dimensions (meters): ${fullWidth.toFixed(2)}m × ${fullHeight.toFixed(2)}m × ${fullDepth.toFixed(2)}m`)

			const maxDimension = Math.max(extent.x, extent.y, extent.z)
			const radius = maxDimension * 1.5

			camera.target = center.clone()
			camera.radius = boundingBox.maximum.subtract(boundingBox.minimum).length() * 1.5
			camera.alpha = Math.PI / 3
			camera.beta = Math.PI / 3

			camera.lowerRadiusLimit = radius * 0.2
			camera.upperRadiusLimit = radius * 5
			camera.minZ = Math.max(0.001, radius * 0.001)
			camera.maxZ = radius * 100

			camera.wheelPrecision = (1 / camera.radius) * 400
			camera.panningSensibility = (1 / camera.radius) * 4000

			console.log(`Camera fitted to model: radius=${camera.radius.toFixed(2)}, extent=[${extent.x.toFixed(2)}, ${extent.y.toFixed(2)}, ${extent.z.toFixed(2)}]`)
		} catch (err) {
			console.error('Error fitting camera:', err)
			error = 'Failed to position camera on model'
			isLoading = false
		}
	}

	function resizeObserver() {
		const observer = new ResizeObserver(() => {
			clearTimeout((observer as any).timeoutId)
			;(observer as any).timeoutId = setTimeout(() => engine?.resize(), 100)
		})
		canvas && observer.observe(canvas)
		engine?.resize()
	}

	function resize() {
		engine?.resize()
	}

	onMount(async () => {
		try {
			if (!file || file.trim() === '') {
				console.error('Viewer mounted without valid file URL:', file)
				error = 'No 3D model URL provided'
				isLoading = false
				return
			}

			console.log('Viewer mounted with file:', file)

			init()
			if (isInitialized) {
				createEnvironment()
				initializeAnnotationSystem()
				start()
				await createScene(file, 'glb')

				// Initialize WebXR after scene is loaded
				await initializeWebXR()
			} else {
				console.error('Failed to initialize viewer')
				error = 'Failed to initialize 3D viewer'
				isLoading = false
			}
		} catch (err) {
			console.error('Error during component mount:', err)
			if (!error) {
				error = 'Failed to load 3D model'
			}
			isLoading = false
		}
	})
</script>

<svelte:window on:resize={resize} />
<div
	class="_dark:from-slate-700 _dark:to-slate-950 relative flex h-full w-full flex-col justify-between bg-gradient-to-b from-slate-50 to-slate-300 text-white"
>
	<canvas class="absolute block h-full w-full border-none outline-none" bind:this={canvas}
	></canvas>

	{#if isLoading}
		<div class="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-300">
			<div class="text-center">
				<Icon icon="tabler:loader-2" class="mx-auto mb-4 size-12 animate-spin text-slate-600" />
				<p class="mb-2 text-lg font-medium text-slate-700">Loading 3D Model</p>
				{#if loadingProgress > 0}
					<div class="mx-auto w-64 rounded-full bg-slate-200">
						<div
							class="h-2 rounded-full bg-sky-500 transition-all duration-300"
							style="width: {loadingProgress}%"
						></div>
					</div>
					<p class="mt-2 text-sm text-slate-600">{Math.round(loadingProgress)}%</p>
				{/if}
			</div>
		</div>
	{/if}

	{#if error}
		<div class="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-300">
			<div class="max-w-md px-6 text-center">
				<Icon icon="tabler:alert-circle" class="mx-auto mb-4 size-12 text-red-500" />
				<h3 class="mb-2 text-lg font-semibold text-slate-800">Unable to Load 3D Model</h3>
				<p class="mb-4 text-slate-600">Please try again.</p>
				<button
					class="rounded-lg bg-sky-600 px-4 py-2 text-white hover:bg-sky-700 transition-colors"
					onclick={() => {
						error = ''
						isLoading = true
						loadingProgress = 0
						createScene(file, 'glb')
					}}
				>
					Try Again
				</button>
			</div>
		</div>
	{/if}

	{#if enableAnnotations}
		<AnnotationTooltip
			annotation={hoveredAnnotation}
			position={tooltipPosition}
			visible={tooltipVisible && hoveredAnnotation !== null}
		/>
	{/if}

	<!-- WebXR AR Button (Android Chrome with WebXR support) -->
	{#if webxrSupport?.supportsAR}
		<div class="absolute bottom-4 left-4 right-4 z-10 md:left-auto md:right-4 md:w-80">
			<WebXRButton
				{webxrSupport}
				{isInXR}
				onEnterXR={enterWebXR}
				onExitXR={exitWebXR}
			/>
		</div>
	{/if}

	<!-- Native AR Buttons (iOS Quick Look / Android Scene Viewer) -->
	<ArButton glbUrl={file} usdzUrl={usdzFile} modelDimensions={modelDimensions} webxrAvailable={webxrSupport?.supportsAR ?? false} />
	<ARPopover glbUrl={file} usdzUrl={usdzFile} modelDimensions={modelDimensions} />
</div>
