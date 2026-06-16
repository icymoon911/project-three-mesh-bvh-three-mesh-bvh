/** @import { BufferGeometry } from 'three' */
import { WorkerBase } from './utils/WorkerBase.js';

/**
 * Helper class for generating a MeshBVH for a given geometry in asynchronously in a worker. The
 * geometry position and index buffer attribute `ArrayBuffers` are transferred to the Worker while
 * the BVH is being generated meaning the geometry will be unavailable to use while the BVH is
 * being processed unless `SharedArrayBuffers` are used. They will be automatically replaced when
 * the MeshBVH is finished generating.
 *
 * _NOTE It's best to reuse a single instance of this class to avoid the overhead of instantiating
 * a new Worker._
 *
 * @extends WorkerBase
 */
export class GenerateMeshBVHWorker extends WorkerBase {

	constructor() {

		const worker = new Worker( new URL( './generateMeshBVH.worker.js', import.meta.url ), { type: 'module' } );
		super( worker );
		this.name = 'GenerateMeshBVHWorker';

	}

	/**
	 * Flag indicating whether or not a BVH is already being generated in the worker.
	 * @name running
	 * @memberof GenerateMeshBVHWorker
	 * @instance
	 * @type {boolean}
	 */

	/**
	 * Generates a `MeshBVH` instance for the given geometry with the given options in a WebWorker.
	 * Returns a Promise that resolves with the generated `MeshBVH`. Throws if already running.
	 *
	 * @name generate
	 * @memberof GenerateMeshBVHWorker
	 * @instance
	 * @function
	 * @param {BufferGeometry} geometry
	 * @param {Object} [options] - Same options accepted by the `MeshBVH` constructor.
	 * @param {function(number): void} [options.onProgress] - Callback invoked with a `[0, 1]`
	 *   progress value as the BVH is built.
	 * @returns {Promise<MeshBVH>}
	 */

	/**
	 * Terminates the worker.
	 *
	 * @name dispose
	 * @memberof GenerateMeshBVHWorker
	 * @instance
	 * @function
	 */

	postTaskMessage( worker, geometry, options ) {

		const index = geometry.index ? geometry.index.array : null;
		const position = geometry.attributes.position.array;
		const transferable = [ position ];
		if ( index ) {

			transferable.push( index );

		}

		worker.postMessage( {

			index,
			position,
			options: {
				...options,
				onProgress: null,
				includedProgressCallback: Boolean( options.onProgress ),
				groups: [ ... geometry.groups ],
			},

		}, transferable.map( arr => arr.buffer ).filter( v => ( typeof SharedArrayBuffer === 'undefined' ) || ! ( v instanceof SharedArrayBuffer ) ) );

	}

}
