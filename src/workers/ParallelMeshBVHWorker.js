/** @import { BufferGeometry } from 'three' */
import { WorkerBase } from './utils/WorkerBase.js';
import { convertToBufferType, isSharedArrayBufferSupported } from '../utils/BufferUtils.js';
import { GenerateMeshBVHWorker } from './GenerateMeshBVHWorker.js';
import { ensureIndex } from '../core/build/geometryUtils.js';

const DEFAULT_WORKER_COUNT = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4;
class _ParallelMeshBVHWorker extends WorkerBase {

	constructor() {

		const worker = new Worker( new URL( './parallelMeshBVH.worker.js', import.meta.url ), { type: 'module' } );
		super( worker );

		this.name = 'ParallelMeshBVHWorker';

		/**
		 * Maximum number of parallel workers to use. Defaults to `navigator.hardwareConcurrency` (minimum 4).
		 * @type {number}
		 */
		this.maxWorkerCount = Math.max( DEFAULT_WORKER_COUNT, 4 );

		if ( ! isSharedArrayBufferSupported() ) {

			throw new Error( 'ParallelMeshBVHWorker: Shared Array Buffers are not supported.' );

		}

	}

	runTask( worker, geometry, options = {} ) {

		if ( ! options.indirect ) {

			ensureIndex( geometry, options );

		}

		return super.runTask( worker, geometry, options );

	}

	postTaskMessage( worker, geometry, options ) {

		const index = geometry.index ? geometry.index.array : null;
		const position = geometry.attributes.position.array;
		worker.postMessage( {

			operation: 'BUILD_BVH',
			maxWorkerCount: this.maxWorkerCount,
			index: convertToBufferType( index, SharedArrayBuffer ),
			position: convertToBufferType( position, SharedArrayBuffer ),
			options: {
				...options,
				onProgress: null,
				includedProgressCallback: Boolean( options.onProgress ),
				groups: [ ...geometry.groups ],
			},

		} );

	}

}

/**
 * A drop-in replacement for `GenerateMeshBVHWorker` that distributes BVH construction across
 * multiple Web Workers in parallel for faster builds on large geometry. Requires
 * `SharedArrayBuffer` support (cross-origin isolated context). Falls back to a single-threaded
 * `GenerateMeshBVHWorker` automatically if `SharedArrayBuffer` is unavailable.
 *
 * Exposes the same API as `GenerateMeshBVHWorker`: `generate`, `dispose`, `running`, and
 * `maxWorkerCount`.
 */
export class ParallelMeshBVHWorker {

	/**
	 * Constructs the worker. If `SharedArrayBuffer` is supported, spawns a parallel worker
	 * capable of using up to `maxWorkerCount` threads. Otherwise, logs a warning and returns a
	 * `GenerateMeshBVHWorker` instance instead.
	 */
	constructor() {

		if ( isSharedArrayBufferSupported() ) {

			return new _ParallelMeshBVHWorker();

		} else {

			console.warn( 'ParallelMeshBVHWorker: SharedArrayBuffers not supported. Falling back to single-threaded GenerateMeshBVHWorker.' );

			const object = new GenerateMeshBVHWorker();
			object.maxWorkerCount = DEFAULT_WORKER_COUNT;
			return object;

		}

	}

}
