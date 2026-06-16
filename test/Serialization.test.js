import {
	Mesh,
	Scene,
	Raycaster,
	SphereGeometry,
	BoxGeometry,
	InstancedMesh,
	MeshBasicMaterial,
	Matrix4,
	Points,
	PointsMaterial,
	LineSegments,
	Line,
	LineLoop,
	LineBasicMaterial,
	BufferGeometry,
	Float32BufferAttribute,
	REVISION,
	Vector3,
} from 'three';
import {
	ObjectBVH,
	PointsBVH,
	LineSegmentsBVH,
	LineLoopBVH,
	LineBVH,
	MeshBVH,
	prepareTransfer,
	restore,
} from 'three-mesh-bvh';

const IS_REVISION_169 = parseInt( REVISION ) >= 169;
const IS_REVISION_175 = parseInt( REVISION ) >= 175;

// ---------------------------------------------------------------------------
// ObjectBVH Serialization
// ---------------------------------------------------------------------------
describe( 'ObjectBVH Serialization', () => {

	if ( ! IS_REVISION_169 ) {

		it.skip( 'Skipping ObjectBVH tests due to three.js revision' );
		return;

	}

	let scene, objects, bvh, raycaster;

	beforeAll( () => {

		scene = new Scene();
		objects = [];

		// Add regular meshes
		for ( let i = 0; i < 10; i ++ ) {

			const mesh = new Mesh(
				new SphereGeometry( 0.5, 8, 8 ),
				new MeshBasicMaterial(),
			);
			mesh.name = `sphere_${ i }`;
			mesh.position.set(
				Math.sin( i * 0.7 ) * 5,
				Math.cos( i * 0.3 ) * 2,
				Math.sin( i * 1.1 ) * 5,
			);
			scene.add( mesh );
			objects.push( mesh );

		}

		// Add instanced mesh
		const instancedMesh = new InstancedMesh(
			new BoxGeometry( 0.6, 0.6, 0.6 ),
			new MeshBasicMaterial(),
			5,
		);
		instancedMesh.name = 'instanced_boxes';
		for ( let i = 0; i < 5; i ++ ) {

			const m = new Matrix4();
			m.setPosition( i * 2, 0, i * 2 );
			instancedMesh.setMatrixAt( i, m );

		}

		instancedMesh.instanceMatrix.needsUpdate = true;
		scene.add( instancedMesh );
		objects.push( instancedMesh );
		scene.updateMatrixWorld( true );

		bvh = new ObjectBVH( scene, { matrixWorld: scene.matrixWorld } );
		raycaster = new Raycaster();

	} );

	it( 'should serialize then deserialize producing identical structure', () => {

		const serialized = ObjectBVH.serialize( bvh );
		expect( serialized.version ).toBe( 1 );
		expect( serialized.roots ).toBeTruthy();
		expect( serialized.roots.length ).toBeGreaterThan( 0 );
		expect( serialized.primitiveBuffer ).toBeTruthy();
		expect( serialized.objectCount ).toBe( bvh.objects.length );

		const deserialized = ObjectBVH.deserialize( serialized, bvh.objects, {
			matrixWorld: bvh.matrixWorld,
		} );

		expect( deserialized ).toBeInstanceOf( ObjectBVH );
		expect( deserialized.objects ).toBe( bvh.objects );
		expect( deserialized.idBits ).toBe( bvh.idBits );
		expect( deserialized.idMask ).toBe( bvh.idMask );
		expect( deserialized.precise ).toBe( bvh.precise );
		expect( deserialized.includeInstances ).toBe( bvh.includeInstances );
		expect( deserialized.primitiveBufferStride ).toBe( 1 );

		// compare root buffers
		for ( let i = 0; i < serialized.roots.length; i ++ ) {

			expect( new Uint8Array( deserialized._roots[ i ] ) ).toEqual( new Uint8Array( bvh._roots[ i ] ) );

		}

		// compare primitive buffers
		expect( Array.from( deserialized.primitiveBuffer ) ).toEqual( Array.from( bvh.primitiveBuffer ) );

	} );

	it( 'should support cloneBuffers option', () => {

		const serializedClone = ObjectBVH.serialize( bvh, { cloneBuffers: true } );
		expect( serializedClone.roots[ 0 ] ).not.toBe( bvh._roots[ 0 ] );
		expect( serializedClone.primitiveBuffer ).not.toBe( bvh.primitiveBuffer );
		expect( Array.from( serializedClone.primitiveBuffer ) ).toEqual( Array.from( bvh.primitiveBuffer ) );

		const serializedShared = ObjectBVH.serialize( bvh, { cloneBuffers: false } );
		expect( serializedShared.roots ).toBe( bvh._roots );
		expect( serializedShared.roots[ 0 ] ).toBe( bvh._roots[ 0 ] );
		expect( serializedShared.primitiveBuffer ).toBe( bvh.primitiveBuffer );

	} );

	it( 'should throw when object count mismatches', () => {

		const serialized = ObjectBVH.serialize( bvh );
		const tooFew = bvh.objects.slice( 0, 3 );
		expect( () => ObjectBVH.deserialize( serialized, tooFew ) ).toThrow( /Expected/ );

	} );

	it( 'getObjectFromId should work after deserialization', () => {

		const serialized = ObjectBVH.serialize( bvh );
		const deserialized = ObjectBVH.deserialize( serialized, bvh.objects, {
			matrixWorld: bvh.matrixWorld,
		} );

		// test all primitive entries
		for ( let i = 0; i < bvh.primitiveBuffer.length; i ++ ) {

			const compositeId = bvh.primitiveBuffer[ i ];
			const originalObject = bvh.getObjectFromId( compositeId );
			const deserializedObject = deserialized.getObjectFromId( compositeId );
			expect( deserializedObject ).toBe( originalObject );

			const originalInstance = bvh.getInstanceFromId( compositeId );
			const deserializedInstance = deserialized.getInstanceFromId( compositeId );
			expect( deserializedInstance ).toBe( originalInstance );

		}

	} );

	it( 'raycast should produce identical results after deserialization', () => {

		const serialized = ObjectBVH.serialize( bvh );
		const deserialized = ObjectBVH.deserialize( serialized, bvh.objects, {
			matrixWorld: bvh.matrixWorld,
		} );

		// Test several rays
		for ( let i = 0; i < 20; i ++ ) {

			raycaster.ray.origin.set(
				Math.sin( i * 1.3 ) * 15,
				Math.cos( i * 0.7 ) * 15,
				Math.sin( i * 0.9 + 1 ) * 15,
			);
			raycaster.ray.direction.copy( raycaster.ray.origin ).multiplyScalar( - 1 ).normalize();

			raycaster.firstHitOnly = false;
			const originalHits = bvh.raycast( raycaster, [] );
			const deserializedHits = deserialized.raycast( raycaster, [] );

			expect( deserializedHits.length ).toBe( originalHits.length );
			for ( let j = 0; j < originalHits.length; j ++ ) {

				expect( deserializedHits[ j ].object ).toBe( originalHits[ j ].object );
				expect( deserializedHits[ j ].distance ).toBeCloseTo( originalHits[ j ].distance, 5 );

			}

			raycaster.firstHitOnly = true;
			const originalFirst = bvh.raycast( raycaster, [] );
			const deserializedFirst = deserialized.raycast( raycaster, [] );
			expect( deserializedFirst.length ).toBe( originalFirst.length );
			if ( originalFirst.length > 0 ) {

				expect( deserializedFirst[ 0 ].object ).toBe( originalFirst[ 0 ].object );
				expect( deserializedFirst[ 0 ].distance ).toBeCloseTo( originalFirst[ 0 ].distance, 5 );

			}

		}

	} );

	it( 'shapecast should produce identical results after deserialization', () => {

		const serialized = ObjectBVH.serialize( bvh );
		const deserialized = ObjectBVH.deserialize( serialized, bvh.objects, {
			matrixWorld: bvh.matrixWorld,
		} );

		let originalCount = 0;
		let deserializedCount = 0;

		bvh.shapecast( {
			intersectsBounds: () => true,
			intersectsObject: () => {

				originalCount ++;
				return false;

			},
		} );

		deserialized.shapecast( {
			intersectsBounds: () => true,
			intersectsObject: () => {

				deserializedCount ++;
				return false;

			},
		} );

		expect( deserializedCount ).toBe( originalCount );

	} );

	it( 'should work with the prepareTransfer/restore worker utility', () => {

		const { serialized, objectPaths } = prepareTransfer( bvh );
		expect( objectPaths.length ).toBe( bvh.objects.length );

		// Simulate "transfer" by using the serialized data directly
		const restored = restore( serialized, bvh.objects, { matrixWorld: bvh.matrixWorld } );
		expect( restored ).toBeInstanceOf( ObjectBVH );

		// Verify raycast works
		raycaster.ray.origin.set( 10, 10, 10 );
		raycaster.ray.direction.set( - 1, - 1, - 1 ).normalize();
		raycaster.firstHitOnly = false;

		const originalHits = bvh.raycast( raycaster, [] );
		const restoredHits = restored.raycast( raycaster, [] );
		expect( restoredHits.length ).toBe( originalHits.length );

	} );

} );

// ---------------------------------------------------------------------------
// PointsBVH Serialization
// ---------------------------------------------------------------------------
describe( 'PointsBVH Serialization', () => {

	if ( ! IS_REVISION_175 ) {

		it.skip( 'Skipping PointsBVH tests due to three.js revision' );
		return;

	}

	let geometry, points, bvh, raycaster;

	beforeAll( () => {

		const pointCount = 200;
		const positions = new Float32Array( pointCount * 3 );
		for ( let i = 0; i < pointCount; i ++ ) {

			positions[ i * 3 + 0 ] = ( Math.random() - 0.5 ) * 10;
			positions[ i * 3 + 1 ] = ( Math.random() - 0.5 ) * 10;
			positions[ i * 3 + 2 ] = ( Math.random() - 0.5 ) * 10;

		}

		geometry = new BufferGeometry();
		geometry.setAttribute( 'position', new Float32BufferAttribute( positions, 3 ) );

		points = new Points( geometry, new PointsMaterial( { size: 0.1 } ) );
		points.updateMatrixWorld( true );

		bvh = new PointsBVH( geometry );
		raycaster = new Raycaster();
		raycaster.params.Points.threshold = 0.1;

	} );

	it( 'should serialize then deserialize producing identical structure', () => {

		const serialized = PointsBVH.serialize( bvh );
		expect( serialized.version ).toBe( 1 );
		expect( serialized.roots ).toBeTruthy();
		expect( serialized.index ).toBeTruthy();

		const deserialized = PointsBVH.deserialize( serialized, geometry );
		expect( deserialized ).toBeInstanceOf( PointsBVH );
		expect( deserialized.geometry ).toBe( geometry );

		// compare root buffers
		for ( let i = 0; i < serialized.roots.length; i ++ ) {

			expect( new Uint8Array( deserialized._roots[ i ] ) ).toEqual( new Uint8Array( bvh._roots[ i ] ) );

		}

	} );

	it( 'should support cloneBuffers option', () => {

		const cloned = PointsBVH.serialize( bvh, { cloneBuffers: true } );
		expect( cloned.roots[ 0 ] ).not.toBe( bvh._roots[ 0 ] );

		const shared = PointsBVH.serialize( bvh, { cloneBuffers: false } );
		expect( shared.roots ).toBe( bvh._roots );

	} );

	it( 'should support indirect mode serialization', () => {

		const indirectBvh = new PointsBVH( geometry.clone(), { indirect: true } );
		const serialized = PointsBVH.serialize( indirectBvh );
		expect( serialized.indirectBuffer ).toBeTruthy();

		const clonedGeom = geometry.clone();
		const deserialized = PointsBVH.deserialize( serialized, clonedGeom );
		expect( deserialized.indirect ).toBe( true );
		expect( deserialized.resolvePrimitiveIndex( 0 ) ).toBe( indirectBvh.resolvePrimitiveIndex( 0 ) );

	} );

	it( 'raycast should produce identical results after deserialization', () => {

		const serialized = PointsBVH.serialize( bvh );
		const clonedGeom = geometry.clone();
		clonedGeom.setAttribute( 'position', new Float32BufferAttribute(
			new Float32Array( geometry.attributes.position.array ),
			3,
		) );
		const deserialized = PointsBVH.deserialize( serialized, clonedGeom );
		const deserializedPoints = new Points( clonedGeom, new PointsMaterial( { size: 0.1 } ) );
		deserializedPoints.updateMatrixWorld( true );

		for ( let i = 0; i < 20; i ++ ) {

			raycaster.ray.origin.set(
				Math.sin( i * 1.3 ) * 15,
				Math.cos( i * 0.7 ) * 15,
				Math.sin( i * 0.9 + 1 ) * 15,
			);
			raycaster.ray.direction.copy( raycaster.ray.origin ).multiplyScalar( - 1 ).normalize();

			raycaster.firstHitOnly = false;
			const originalHits = bvh.raycastObject3D( points, raycaster, [] );
			const deserializedHits = deserialized.raycastObject3D( deserializedPoints, raycaster, [] );

			expect( deserializedHits.length ).toBe( originalHits.length );
			for ( let j = 0; j < originalHits.length; j ++ ) {

				expect( deserializedHits[ j ].distance ).toBeCloseTo( originalHits[ j ].distance, 5 );
				expect( deserializedHits[ j ].index ).toBe( originalHits[ j ].index );

			}

		}

	} );

	it( 'shapecast should produce identical results after deserialization', () => {

		const serialized = PointsBVH.serialize( bvh );
		const clonedGeom = geometry.clone();
		clonedGeom.setAttribute( 'position', new Float32BufferAttribute(
			new Float32Array( geometry.attributes.position.array ),
			3,
		) );
		const deserialized = PointsBVH.deserialize( serialized, clonedGeom );

		let originalCount = 0;
		let deserializedCount = 0;

		bvh.shapecast( {
			intersectsBounds: () => true,
			intersectsPoint: () => {

				originalCount ++;
				return false;

			},
		} );

		deserialized.shapecast( {
			intersectsBounds: () => true,
			intersectsPoint: () => {

				deserializedCount ++;
				return false;

			},
		} );

		expect( deserializedCount ).toBe( originalCount );

	} );

} );

// ---------------------------------------------------------------------------
// LineSegmentsBVH Serialization
// ---------------------------------------------------------------------------
describe( 'LineSegmentsBVH Serialization', () => {

	if ( ! IS_REVISION_175 ) {

		it.skip( 'Skipping LineSegmentsBVH tests due to three.js revision' );
		return;

	}

	let geometry, lineSegments, bvh, raycaster;

	beforeAll( () => {

		const segmentCount = 50;
		const vertexCount = segmentCount * 2;
		const positions = new Float32Array( vertexCount * 3 );
		for ( let i = 0; i < vertexCount; i ++ ) {

			positions[ i * 3 + 0 ] = ( Math.random() - 0.5 ) * 10;
			positions[ i * 3 + 1 ] = ( Math.random() - 0.5 ) * 10;
			positions[ i * 3 + 2 ] = ( Math.random() - 0.5 ) * 10;

		}

		geometry = new BufferGeometry();
		geometry.setAttribute( 'position', new Float32BufferAttribute( positions, 3 ) );

		lineSegments = new LineSegments( geometry, new LineBasicMaterial() );
		lineSegments.updateMatrixWorld( true );

		bvh = new LineSegmentsBVH( geometry );
		raycaster = new Raycaster();
		raycaster.params.Line.threshold = 0.1;

	} );

	it( 'should serialize then deserialize producing identical structure', () => {

		const serialized = LineSegmentsBVH.serialize( bvh );
		expect( serialized.version ).toBe( 1 );
		expect( serialized.roots ).toBeTruthy();
		expect( serialized.index ).toBeTruthy();

		const deserialized = LineSegmentsBVH.deserialize( serialized, geometry );
		expect( deserialized ).toBeInstanceOf( LineSegmentsBVH );
		expect( deserialized.geometry ).toBe( geometry );
		expect( deserialized.primitiveStride ).toBe( 2 );

	} );

	it( 'raycast should produce identical results after deserialization', () => {

		const serialized = LineSegmentsBVH.serialize( bvh );
		const clonedGeom = geometry.clone();
		clonedGeom.setAttribute( 'position', new Float32BufferAttribute(
			new Float32Array( geometry.attributes.position.array ),
			3,
		) );
		const deserialized = LineSegmentsBVH.deserialize( serialized, clonedGeom );
		const deserializedLine = new LineSegments( clonedGeom, new LineBasicMaterial() );
		deserializedLine.updateMatrixWorld( true );

		for ( let i = 0; i < 20; i ++ ) {

			raycaster.ray.origin.set(
				Math.sin( i * 1.3 ) * 15,
				Math.cos( i * 0.7 ) * 15,
				Math.sin( i * 0.9 + 1 ) * 15,
			);
			raycaster.ray.direction.copy( raycaster.ray.origin ).multiplyScalar( - 1 ).normalize();

			raycaster.firstHitOnly = false;
			const originalHits = bvh.raycastObject3D( lineSegments, raycaster, [] );
			const deserializedHits = deserialized.raycastObject3D( deserializedLine, raycaster, [] );

			expect( deserializedHits.length ).toBe( originalHits.length );
			for ( let j = 0; j < originalHits.length; j ++ ) {

				expect( deserializedHits[ j ].distance ).toBeCloseTo( originalHits[ j ].distance, 5 );

			}

		}

	} );

	it( 'shapecast should produce identical results after deserialization', () => {

		const serialized = LineSegmentsBVH.serialize( bvh );
		const clonedGeom = geometry.clone();
		clonedGeom.setAttribute( 'position', new Float32BufferAttribute(
			new Float32Array( geometry.attributes.position.array ),
			3,
		) );
		const deserialized = LineSegmentsBVH.deserialize( serialized, clonedGeom );

		let originalCount = 0;
		let deserializedCount = 0;

		bvh.shapecast( {
			intersectsBounds: () => true,
			intersectsLine: () => {

				originalCount ++;
				return false;

			},
		} );

		deserialized.shapecast( {
			intersectsBounds: () => true,
			intersectsLine: () => {

				deserializedCount ++;
				return false;

			},
		} );

		expect( deserializedCount ).toBe( originalCount );

	} );

} );

// ---------------------------------------------------------------------------
// LineLoopBVH Serialization
// ---------------------------------------------------------------------------
describe( 'LineLoopBVH Serialization', () => {

	if ( ! IS_REVISION_175 ) {

		it.skip( 'Skipping LineLoopBVH tests due to three.js revision' );
		return;

	}

	let geometry, lineLoop, bvh, raycaster;

	beforeAll( () => {

		const vertexCount = 30;
		const positions = new Float32Array( vertexCount * 3 );
		for ( let i = 0; i < vertexCount; i ++ ) {

			const angle = ( i / vertexCount ) * Math.PI * 2;
			positions[ i * 3 + 0 ] = Math.cos( angle ) * 5;
			positions[ i * 3 + 1 ] = Math.sin( angle ) * 5;
			positions[ i * 3 + 2 ] = ( Math.random() - 0.5 ) * 2;

		}

		geometry = new BufferGeometry();
		geometry.setAttribute( 'position', new Float32BufferAttribute( positions, 3 ) );

		lineLoop = new LineLoop( geometry, new LineBasicMaterial() );
		lineLoop.updateMatrixWorld( true );

		bvh = new LineLoopBVH( geometry );
		raycaster = new Raycaster();
		raycaster.params.Line.threshold = 0.1;

	} );

	it( 'should serialize then deserialize with indirect mode', () => {

		// LineLoopBVH always uses indirect mode
		expect( bvh.indirect ).toBe( true );

		const serialized = LineLoopBVH.serialize( bvh );
		expect( serialized.indirectBuffer ).toBeTruthy();

		const clonedGeom = geometry.clone();
		clonedGeom.setAttribute( 'position', new Float32BufferAttribute(
			new Float32Array( geometry.attributes.position.array ),
			3,
		) );
		const deserialized = LineLoopBVH.deserialize( serialized, clonedGeom );
		expect( deserialized ).toBeInstanceOf( LineLoopBVH );
		expect( deserialized.indirect ).toBe( true );
		expect( deserialized.primitiveStride ).toBe( 1 );

	} );

	it( 'raycast should produce identical results after deserialization', () => {

		const serialized = LineLoopBVH.serialize( bvh );
		const clonedGeom = geometry.clone();
		clonedGeom.setAttribute( 'position', new Float32BufferAttribute(
			new Float32Array( geometry.attributes.position.array ),
			3,
		) );
		const deserialized = LineLoopBVH.deserialize( serialized, clonedGeom );
		const deserializedLoop = new LineLoop( clonedGeom, new LineBasicMaterial() );
		deserializedLoop.updateMatrixWorld( true );

		for ( let i = 0; i < 10; i ++ ) {

			raycaster.ray.origin.set(
				Math.sin( i * 1.3 ) * 15,
				Math.cos( i * 0.7 ) * 15,
				5,
			);
			raycaster.ray.direction.copy( raycaster.ray.origin ).multiplyScalar( - 1 ).normalize();

			raycaster.firstHitOnly = false;
			const originalHits = bvh.raycastObject3D( lineLoop, raycaster, [] );
			const deserializedHits = deserialized.raycastObject3D( deserializedLoop, raycaster, [] );

			expect( deserializedHits.length ).toBe( originalHits.length );

		}

	} );

} );

// ---------------------------------------------------------------------------
// LineBVH Serialization
// ---------------------------------------------------------------------------
describe( 'LineBVH Serialization', () => {

	if ( ! IS_REVISION_175 ) {

		it.skip( 'Skipping LineBVH tests due to three.js revision' );
		return;

	}

	let geometry, line, bvh, raycaster;

	beforeAll( () => {

		const vertexCount = 30;
		const positions = new Float32Array( vertexCount * 3 );
		for ( let i = 0; i < vertexCount; i ++ ) {

			positions[ i * 3 + 0 ] = i * 0.5;
			positions[ i * 3 + 1 ] = Math.sin( i * 0.5 ) * 2;
			positions[ i * 3 + 2 ] = Math.cos( i * 0.3 ) * 2;

		}

		geometry = new BufferGeometry();
		geometry.setAttribute( 'position', new Float32BufferAttribute( positions, 3 ) );

		line = new Line( geometry, new LineBasicMaterial() );
		line.updateMatrixWorld( true );

		bvh = new LineBVH( geometry );
		raycaster = new Raycaster();
		raycaster.params.Line.threshold = 0.1;

	} );

	it( 'should serialize then deserialize with indirect mode', () => {

		expect( bvh.indirect ).toBe( true );

		const serialized = LineBVH.serialize( bvh );
		expect( serialized.indirectBuffer ).toBeTruthy();

		const clonedGeom = geometry.clone();
		clonedGeom.setAttribute( 'position', new Float32BufferAttribute(
			new Float32Array( geometry.attributes.position.array ),
			3,
		) );
		const deserialized = LineBVH.deserialize( serialized, clonedGeom );
		expect( deserialized ).toBeInstanceOf( LineBVH );
		expect( deserialized.indirect ).toBe( true );

	} );

	it( 'raycast should produce identical results after deserialization', () => {

		const serialized = LineBVH.serialize( bvh );
		const clonedGeom = geometry.clone();
		clonedGeom.setAttribute( 'position', new Float32BufferAttribute(
			new Float32Array( geometry.attributes.position.array ),
			3,
		) );
		const deserialized = LineBVH.deserialize( serialized, clonedGeom );
		const deserializedLine = new Line( clonedGeom, new LineBasicMaterial() );
		deserializedLine.updateMatrixWorld( true );

		for ( let i = 0; i < 10; i ++ ) {

			raycaster.ray.origin.set(
				5,
				Math.cos( i * 0.7 ) * 10,
				15,
			);
			raycaster.ray.direction.set( 0, 0, - 1 );

			raycaster.firstHitOnly = false;
			const originalHits = bvh.raycastObject3D( line, raycaster, [] );
			const deserializedHits = deserialized.raycastObject3D( deserializedLine, raycaster, [] );

			expect( deserializedHits.length ).toBe( originalHits.length );

		}

	} );

} );

// ---------------------------------------------------------------------------
// MeshBVH backward compatibility (ensure refactoring didn't break anything)
// ---------------------------------------------------------------------------
describe( 'MeshBVH Serialization (backward compatibility)', () => {

	it( 'should still work after delegating to GeometryBVH', () => {

		const geometry = new SphereGeometry( 1, 10, 10 );
		const bvh = new MeshBVH( geometry );
		const serialized = MeshBVH.serialize( bvh );
		const deserialized = MeshBVH.deserialize( serialized, geometry );

		expect( deserialized ).toBeInstanceOf( MeshBVH );
		for ( let i = 0; i < serialized.roots.length; i ++ ) {

			expect( new Uint8Array( deserialized._roots[ i ] ) ).toEqual( new Uint8Array( bvh._roots[ i ] ) );

		}

	} );

	it( 'should still handle version 0 data', () => {

		const geometry = new SphereGeometry( 1, 16, 16 );
		const bvh = new MeshBVH( geometry, { maxLeafSize: 5 } );
		const serialized = MeshBVH.serialize( bvh );
		const oldSerialized = { ...serialized };
		delete oldSerialized.version;

		// convert to old format
		oldSerialized.roots = oldSerialized.roots.map( root => {

			const clonedRoot = root.slice();
			const uint32Array = new Uint32Array( clonedRoot );
			const uint16Array = new Uint16Array( clonedRoot );
			const BYTES_PER_NODE = 32;
			const UINT32_PER_NODE = BYTES_PER_NODE / 4;
			const IS_LEAFNODE_FLAG = 0xFFFF;

			for ( let node = 0, l = root.byteLength / BYTES_PER_NODE; node < l; node ++ ) {

				const node32Index = UINT32_PER_NODE * node;
				const node16Index = 2 * node32Index;
				const isLeaf = uint16Array[ node16Index + 15 ] === IS_LEAFNODE_FLAG;
				if ( ! isLeaf ) {

					uint32Array[ node32Index + 6 ] = ( node + uint32Array[ node32Index + 6 ] ) * UINT32_PER_NODE;

				}

			}

			return clonedRoot;

		} );

		const deserialized = MeshBVH.deserialize( oldSerialized, geometry.clone() );
		expect( deserialized ).toEqualBVH( bvh );

	} );

} );
