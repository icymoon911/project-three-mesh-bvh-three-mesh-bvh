/**
 * Web Worker entry point for building an ObjectBVH from serialized object entries.
 *
 * Usage from the main thread:
 *
 *   import { describeObject, getObjectBVHTransferables } from '../utils/ObjectBVHWorkerUtils.js';
 *   import { ObjectBVH } from 'three-mesh-bvh';
 *
 *   const worker = new Worker(
 *     new URL( './generateObjectBVH.worker.js', import.meta.url ),
 *     { type: 'module' }
 *   );
 *
 *   scene.updateMatrixWorld( true );
 *   const objectEntries = [];
 *   scene.traverse( child => {
 *     if ( child.isMesh || child.isLine || child.isPoints ) {
 *       // ensure bounds are computed before describing
 *       if ( child.geometry && ! child.geometry.boundingBox ) child.geometry.computeBoundingBox();
 *       if ( child.geometry && ! child.geometry.boundingSphere ) child.geometry.computeBoundingSphere();
 *       objectEntries.push( describeObject( child ) );
 *     }
 *   } );
 *
 *   worker.postMessage( { objectEntries, options: { precise: false } } );
 *
 *   worker.onmessage = ( { data } ) => {
 *     if ( data.error ) throw new Error( data.error );
 *     const bvh = ObjectBVH.deserialize(
 *       data.serialized,
 *       uuid => scene.getObjectByProperty( 'uuid', uuid ),
 *       { matrixWorld: scene.matrixWorld }
 *     );
 *     // bvh is now fully usable
 *   };
 */

import { buildObjectBVHFromEntries, getObjectBVHTransferables } from '../utils/ObjectBVHWorkerUtils.js';

self.onmessage = ( { data } ) => {

	const { objectEntries, options } = data;

	try {

		const serialized = buildObjectBVHFromEntries( objectEntries, options );
		const transferables = getObjectBVHTransferables( serialized );

		self.postMessage( {
			error: null,
			serialized,
		}, transferables );

	} catch ( error ) {

		self.postMessage( {
			error: error.message || String( error ),
			serialized: null,
		} );

	}

};
