/**
 * Utility for transferring an ObjectBVH between contexts (e.g. Web Worker ↔ main thread).
 *
 * ObjectBVH cannot be directly posted across Worker boundaries because its `objects` array
 * holds live Object3D references. This utility provides a two-step pattern:
 *
 * 1. **Sender side** (Worker or main thread): call `prepareTransfer(bvh)` to produce a
 *    `SerializedBVH` plus an ordered `objectMap` that the receiver can use to reconstruct
 *    the associations.
 *
 * 2. **Receiver side**: call `restore(data, objects)` with the serialized data and the
 *    matching array of Object3D instances (same order as `objectMap`) to get a fully
 *    functional ObjectBVH.
 *
 * Example (pseudo-code):
 *
 * ```js
 * // Worker thread
 * import { ObjectBVH } from 'three-mesh-bvh';
 * import { prepareTransfer } from './ObjectBVHWorkerUtils.js';
 *
 * const bvh = new ObjectBVH( scene );
 * const { serialized, objectPaths } = prepareTransfer( bvh );
 * self.postMessage( { serialized, objectPaths }, [ serialized.roots, serialized.primitiveBuffer ] );
 *
 * // Main thread
 * import { ObjectBVH } from 'three-mesh-bvh';
 * import { restore } from './ObjectBVHWorkerUtils.js';
 *
 * worker.onmessage = ( e ) => {
 *     const { serialized, objectPaths } = e.data;
 *     const objects = objectPaths.map( path => resolveScenePath( scene, path ) );
 *     const bvh = restore( serialized, objects, { matrixWorld: scene.matrixWorld } );
 *     // bvh.raycast( raycaster ) now works
 * };
 * ```
 */
import { ObjectBVH } from '../core/ObjectBVH.js';

/**
 * Produces a serializable representation of an ObjectBVH along with an ordered list
 * of object identifiers that the receiver can use to reconstruct the object mapping.
 *
 * The identifiers are built from each object's scene-graph path (concatenated `name`
 * fields), falling back to array index when names are missing.
 *
 * @param {ObjectBVH} bvh - The ObjectBVH to prepare for transfer.
 * @param {Object} [options]
 * @param {boolean} [options.cloneBuffers=true] - Clone root and primitive buffers so the
 *   serialized data is independent of the live BVH.
 * @returns {{ serialized: Object, objectPaths: Array<string> }}
 */
export function prepareTransfer( bvh, options = {} ) {

	const serialized = ObjectBVH.serialize( bvh, options );
	const objectPaths = bvh.objects.map( ( obj, i ) => {

		return getObjectPath( obj ) || `__index_${ i }`;

	} );

	return { serialized, objectPaths };

}

/**
 * Restores a fully functional ObjectBVH from serialized data and a matching objects array.
 *
 * @param {Object} serialized - Serialized BVH data from `prepareTransfer`.
 * @param {Array<Object3D>} objects - Array of Object3D instances, in the same order as
 *   the original BVH's `objects` array.
 * @param {Object} [options]
 * @param {Matrix4} [options.matrixWorld] - The world matrix for the BVH frame.
 * @returns {ObjectBVH}
 */
export function restore( serialized, objects, options = {} ) {

	return ObjectBVH.deserialize( serialized, objects, options );

}

/**
 * Resolves a scene-graph path string back to an Object3D.
 *
 * @param {Object3D} root - The root of the scene graph to search.
 * @param {string} path - A slash-separated path of `name` fields, or an `__index_N` fallback.
 * @param {Array<Object3D>} [fallbackObjects] - Optional flat array of objects to use when
 *   the path is an `__index_N` fallback.
 * @returns {Object3D|null}
 */
export function resolveObjectPath( root, path, fallbackObjects = null ) {

	if ( path.startsWith( '__index_' ) ) {

		const idx = parseInt( path.slice( 8 ), 10 );
		return fallbackObjects ? fallbackObjects[ idx ] : null;

	}

	const parts = path.split( '/' );
	let current = root;
	for ( const part of parts ) {

		if ( current.name === part && parts.indexOf( part ) === 0 ) {

			continue;

		}

		let found = null;
		current.traverse( child => {

			if ( child.name === part && ! found ) {

				found = child;

			}

		} );

		if ( ! found ) return null;
		current = found;

	}

	return current;

}

/**
 * Builds a slash-separated path string for an Object3D by walking up the parent chain.
 *
 * @param {Object3D} object
 * @returns {string|null}
 */
function getObjectPath( object ) {

	const parts = [];
	let current = object;
	while ( current ) {

		if ( current.name ) {

			parts.unshift( current.name );

		} else {

			// unnamed object in the chain — fall back to index-based approach
			return null;

		}

		current = current.parent;

	}

	return parts.join( '/' );

}
