/**
 * Example: Building an ObjectBVH in a Web Worker and deserializing on the main thread.
 *
 * Because ObjectBVH requires Object3D references to compute bounds during construction,
 * the worker must receive a lightweight description of each scene object (bounds, transform,
 * instance metadata). The main thread then deserializes the returned BVH by re-linking
 * the original Object3D references via their UUIDs.
 *
 * Worker input (sent from main thread):
 *   - objectEntries: Array of { uuid, isInstancedMesh, isBatchedMesh, instanceCount,
 *       maxInstanceCount, boundingBox, boundingSphere, matrixWorld, geometryBoundingBox,
 *       geometryBoundingSphere, visible }
 *   - options: BVH build options
 *
 * Worker output (sent back to main thread):
 *   - serialized: Serialized ObjectBVH (roots, primitiveBuffer, objectIds, ...)
 *
 * Usage:
 *
 *   // main thread
 *   import { ObjectBVH } from 'three-mesh-bvh';
 *
 *   const worker = new Worker(
 *     new URL( './generateObjectBVH.worker.js', import.meta.url ),
 *     { type: 'module' }
 *   );
 *
 *   // 1. Describe the scene objects
 *   const objectEntries = [];
 *   scene.traverse( child => {
 *     if ( child.isMesh || child.isLine || child.isPoints ) {
 *       objectEntries.push( describeObject( child ) );
 *     }
 *   } );
 *
 *   // 2. Send to worker
 *   worker.postMessage( { objectEntries, options: { precise: false } } );
 *
 *   // 3. Receive serialized BVH and deserialize with live object references
 *   worker.onmessage = ( { data } ) => {
 *     const { serialized } = data;
 *     const bvh = ObjectBVH.deserialize( serialized, uuid => scene.getObjectByProperty( 'uuid', uuid ) );
 *     // bvh.raycast( raycaster ) is now usable
 *   };
 */

import { Box3, Matrix4, Sphere } from 'three';
import { ObjectBVH } from '../core/ObjectBVH.js';
import { SKIP_GENERATION } from '../core/Constants.js';

const _box = /* @__PURE__ */ new Box3();
const _sphere = /* @__PURE__ */ new Sphere();
const _matrix = /* @__PURE__ */ new Matrix4();

/**
 * Describes an Object3D as a lightweight plain-object suitable for transfer to a worker.
 * @param {import('three').Object3D} object
 * @returns {Object}
 */
export function describeObject( object ) {

	const entry = {
		uuid: object.uuid,
		isMesh: !! object.isMesh,
		isLine: !! object.isLine,
		isPoints: !! object.isPoints,
		isInstancedMesh: !! object.isInstancedMesh,
		isBatchedMesh: !! object.isBatchedMesh,
		visible: object.visible,
		matrixWorld: object.matrixWorld.elements.slice(),
	};

	if ( object.isInstancedMesh ) {

		entry.count = object.count;
		if ( object.geometry.boundingBox ) {

			entry.geometryBoundingBox = {
				min: object.geometry.boundingBox.min.toArray(),
				max: object.geometry.boundingBox.max.toArray(),
			};

		}

		if ( object.geometry.boundingSphere ) {

			entry.geometryBoundingSphere = {
				center: object.geometry.boundingSphere.center.toArray(),
				radius: object.geometry.boundingSphere.radius,
			};

		}

	}

	if ( object.isBatchedMesh ) {

		entry.instanceCount = object.instanceCount;
		entry.maxInstanceCount = object.maxInstanceCount;

	}

	// overall bounding box / sphere (used for the fast path)
	if ( object.boundingBox ) {

		entry.boundingBox = {
			min: object.boundingBox.min.toArray(),
			max: object.boundingBox.max.toArray(),
		};

	}

	if ( object.boundingSphere ) {

		entry.boundingSphere = {
			center: object.boundingSphere.center.toArray(),
			radius: object.boundingSphere.radius,
		};

	}

	// For regular meshes (not instanced), we also need the geometry's bounding box
	// since ObjectBVH._getPrimitiveBoundingBox uses setFromObject which reads geometry.boundingBox
	if ( ! entry.isInstancedMesh && ! entry.isBatchedMesh && object.geometry ) {

		if ( ! object.geometry.boundingBox ) {

			object.geometry.computeBoundingBox();

		}

		if ( ! object.geometry.boundingSphere ) {

			object.geometry.computeBoundingSphere();

		}

		if ( object.geometry.boundingBox ) {

			entry.geometryBoundingBox = {
				min: object.geometry.boundingBox.min.toArray(),
				max: object.geometry.boundingBox.max.toArray(),
			};

		}

		if ( object.geometry.boundingSphere ) {

			entry.geometryBoundingSphere = {
				center: object.geometry.boundingSphere.center.toArray(),
				radius: object.geometry.boundingSphere.radius,
			};

		}

	}

	return entry;

}

/**
 * Reconstructs a "proxy" Object3D-like object from a serialized entry.
 * Used inside the worker to satisfy ObjectBVH's bounds queries.
 *
 * @param {Object} entry
 * @returns {Object}
 */
function reviveProxy( entry ) {

	const proxy = {
		uuid: entry.uuid,
		visible: entry.visible,
		isMesh: entry.isMesh,
		isLine: entry.isLine,
		isPoints: entry.isPoints,
		isInstancedMesh: entry.isInstancedMesh,
		isBatchedMesh: entry.isBatchedMesh,
		matrixWorld: new Matrix4().fromArray( entry.matrixWorld ),
		// stubs required by Box3.setFromObject / Box3.expandByObject and ObjectBVH's collectObjects
		children: [],
		parent: null,
		updateWorldMatrix() {},
		updateMatrix() {},
		updateMatrixWorld() {},
		traverse( callback ) {

			callback( this );

		},
	};

	if ( entry.isInstancedMesh ) {

		proxy.count = entry.count;

		const geometry = {};

		if ( entry.geometryBoundingBox ) {

			geometry.boundingBox = new Box3();
			geometry.boundingBox.min.fromArray( entry.geometryBoundingBox.min );
			geometry.boundingBox.max.fromArray( entry.geometryBoundingBox.max );

		}

		if ( entry.geometryBoundingSphere ) {

			geometry.boundingSphere = new Sphere();
			geometry.boundingSphere.center.fromArray( entry.geometryBoundingSphere.center );
			geometry.boundingSphere.radius = entry.geometryBoundingSphere.radius;

		}

		proxy.geometry = geometry;

		// minimal getMatrixAt stub - returns identity since matrixWorld already accounts for it
		proxy.getMatrixAt = ( /* id, target */ ) => {};

	}

	if ( entry.isBatchedMesh ) {

		proxy.instanceCount = entry.instanceCount;
		proxy.maxInstanceCount = entry.maxInstanceCount;
		proxy.getVisibleAt = () => true;
		proxy.getMatrixAt = () => {};

	}

	// For regular meshes, provide a geometry with bounding information
	// so that Box3.setFromObject(object, false) works correctly
	if ( ! entry.isInstancedMesh && ! entry.isBatchedMesh && ( entry.geometryBoundingBox || entry.geometryBoundingSphere ) ) {

		const geometry = {
			// getAttribute stub required by Box3.expandByObject
			getAttribute() {

				return null;

			},
			computeBoundingBox() {},
			computeBoundingSphere() {},
		};

		if ( entry.geometryBoundingBox ) {

			geometry.boundingBox = new Box3();
			geometry.boundingBox.min.fromArray( entry.geometryBoundingBox.min );
			geometry.boundingBox.max.fromArray( entry.geometryBoundingBox.max );

		} else {

			geometry.boundingBox = null;

		}

		if ( entry.geometryBoundingSphere ) {

			geometry.boundingSphere = new Sphere();
			geometry.boundingSphere.center.fromArray( entry.geometryBoundingSphere.center );
			geometry.boundingSphere.radius = entry.geometryBoundingSphere.radius;

		} else {

			geometry.boundingSphere = null;

		}

		proxy.geometry = geometry;

	}

	if ( entry.boundingBox ) {

		proxy.boundingBox = new Box3();
		proxy.boundingBox.min.fromArray( entry.boundingBox.min );
		proxy.boundingBox.max.fromArray( entry.boundingBox.max );
		proxy.computeBoundingBox = () => {};

	}

	if ( entry.boundingSphere ) {

		proxy.boundingSphere = new Sphere();
		proxy.boundingSphere.center.fromArray( entry.boundingSphere.center );
		proxy.boundingSphere.radius = entry.boundingSphere.radius;
		proxy.computeBoundingSphere = () => {};

	}

	return proxy;

}

/**
 * Builds an ObjectBVH inside a worker-like environment from serialized object entries.
 * This function is exported for testing and as a reference for custom worker implementations.
 *
 * @param {Array<Object>} objectEntries - Array of serialized object entries from `describeObject`.
 * @param {Object} [options] - BVH build options.
 * @returns {Object} Serialized ObjectBVH data.
 */
export function buildObjectBVHFromEntries( objectEntries, options = {} ) {

	const proxies = objectEntries.map( reviveProxy );

	// ObjectBVH expects an array of Object3D-like objects (or a scene root)
	const bvh = new ObjectBVH( proxies, {
		...options,
		matrixWorld: new Matrix4(),
	} );

	return ObjectBVH.serialize( bvh, { cloneBuffers: true } );

}

/**
 * Helper to collect transferable buffers from a serialized ObjectBVH.
 *
 * @param {Object} serialized
 * @returns {Array<ArrayBuffer>}
 */
export function getObjectBVHTransferables( serialized ) {

	const transferables = [];
	for ( const root of serialized.roots ) {

		if ( typeof SharedArrayBuffer === 'undefined' || ! ( root instanceof SharedArrayBuffer ) ) {

			transferables.push( root );

		}

	}

	if ( serialized.primitiveBuffer ) {

		const buf = serialized.primitiveBuffer.buffer;
		if ( typeof SharedArrayBuffer === 'undefined' || ! ( buf instanceof SharedArrayBuffer ) ) {

			transferables.push( buf );

		}

	}

	return transferables;

}
