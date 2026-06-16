import {
	BufferGeometry,
	BufferAttribute,
	Float32BufferAttribute,
	SphereGeometry,
	BoxGeometry,
	Mesh,
	MeshBasicMaterial,
	Points,
	PointsMaterial,
	LineSegments,
	LineBasicMaterial,
	Line,
	Scene,
	Raycaster,
	Vector3,
	Box3,
	Sphere,
	Matrix4,
	Ray,
	FrontSide,
} from 'three';
import {
	MeshBVH,
	ObjectBVH,
	PointsBVH,
	LineSegmentsBVH,
	LineLoopBVH,
	LineBVH,
	validateBounds,
} from 'three-mesh-bvh';

describe( 'GeometryBVH Serialization', () => {

	describe( 'PointsBVH', () => {

		let geometry, points, bvh;
		beforeEach( () => {

			geometry = new BufferGeometry();
			const positions = new Float32Array( 300 * 3 );
			for ( let i = 0; i < positions.length; i ++ ) {

				positions[ i ] = ( Math.random() - 0.5 ) * 10;

			}

			geometry.setAttribute( 'position', new Float32BufferAttribute( positions, 3 ) );

			points = new Points( geometry, new PointsMaterial( { size: 0.1 } ) );
			points.updateMatrixWorld( true );

			bvh = new PointsBVH( geometry );
			points.boundsTree = bvh;

		} );

		it( 'should serialize then deserialize to an equivalent BVH.', () => {

			const serialized = PointsBVH.serialize( bvh );
			expect( serialized.version ).toBe( 1 );

			const deserialized = PointsBVH.deserialize( serialized, geometry );

			expect( deserialized ).toBeInstanceOf( PointsBVH );
			expect( deserialized._roots.length ).toBe( bvh._roots.length );

			// roots should be byte-equal
			for ( let i = 0; i < bvh._roots.length; i ++ ) {

				expect( new Uint8Array( bvh._roots[ i ] ) ).toEqual( new Uint8Array( deserialized._roots[ i ] ) );

			}

			expect( validateBounds( deserialized ) ).toBeTruthy();

		} );

		it( 'should produce identical shapecast results after deserialization.', () => {

			const serialized = PointsBVH.serialize( bvh );
			const deserialized = PointsBVH.deserialize( serialized, geometry );

			const querySphere = new Sphere( new Vector3( 0, 0, 0 ), 2 );

			const originalHits = [];
			bvh.shapecast( {
				intersectsBounds: box => querySphere.intersectsBox( box ),
				intersectsPoint: ( point, index ) => {

					originalHits.push( index );

				},
			} );

			const deserializedHits = [];
			deserialized.shapecast( {
				intersectsBounds: box => querySphere.intersectsBox( box ),
				intersectsPoint: ( point, index ) => {

					deserializedHits.push( index );

				},
			} );

			originalHits.sort( ( a, b ) => a - b );
			deserializedHits.sort( ( a, b ) => a - b );
			expect( deserializedHits ).toEqual( originalHits );

		} );

		it( 'should produce identical raycast results after deserialization.', () => {

			const serialized = PointsBVH.serialize( bvh );
			const deserialized = PointsBVH.deserialize( serialized, geometry );

			const raycaster = new Raycaster();
			raycaster.params.Points.threshold = 0.5;
			raycaster.ray.origin.set( 0, 0, 10 );
			raycaster.ray.direction.set( 0, 0, - 1 );
			raycaster.firstHitOnly = false;

			const originalHits = bvh.raycastObject3D( points, raycaster, [] );
			const deserializedHits = deserialized.raycastObject3D( points, raycaster, [] );

			expect( deserializedHits.length ).toBe( originalHits.length );

			originalHits.sort( ( a, b ) => a.distance - b.distance );
			deserializedHits.sort( ( a, b ) => a.distance - b.distance );
			for ( let i = 0; i < originalHits.length; i ++ ) {

				expect( deserializedHits[ i ].index ).toBe( originalHits[ i ].index );
				expect( deserializedHits[ i ].distance ).toBeCloseTo( originalHits[ i ].distance, 5 );

			}

		} );

		it( 'should respect cloneBuffers option.', () => {

			const serialized = PointsBVH.serialize( bvh, { cloneBuffers: true } );
			expect( serialized.roots ).not.toBe( bvh._roots );
			expect( serialized.roots[ 0 ] ).not.toBe( bvh._roots[ 0 ] );
			expect( new Uint8Array( serialized.roots[ 0 ] ) ).toEqual( new Uint8Array( bvh._roots[ 0 ] ) );

			const serialized2 = PointsBVH.serialize( bvh, { cloneBuffers: false } );
			expect( serialized2.roots ).toBe( bvh._roots );
			expect( serialized2.roots[ 0 ] ).toBe( bvh._roots[ 0 ] );

		} );

		it( 'should work with indirect mode.', () => {

			const indirectBvh = new PointsBVH( geometry, { indirect: true } );
			const serialized = PointsBVH.serialize( indirectBvh );
			const deserialized = PointsBVH.deserialize( serialized, geometry );

			expect( deserialized.indirect ).toBe( true );
			expect( validateBounds( deserialized ) ).toBeTruthy();

		} );

	} );

	describe( 'LineSegmentsBVH', () => {

		let geometry, lineSegments, bvh;
		beforeEach( () => {

			geometry = new BufferGeometry();
			// 100 line segments = 200 vertices
			const positions = new Float32Array( 200 * 3 );
			for ( let i = 0; i < positions.length; i ++ ) {

				positions[ i ] = ( Math.random() - 0.5 ) * 10;

			}

			geometry.setAttribute( 'position', new Float32BufferAttribute( positions, 3 ) );

			lineSegments = new LineSegments( geometry, new LineBasicMaterial() );
			lineSegments.updateMatrixWorld( true );

			bvh = new LineSegmentsBVH( geometry );
			lineSegments.boundsTree = bvh;

		} );

		it( 'should serialize then deserialize to an equivalent BVH.', () => {

			const serialized = LineSegmentsBVH.serialize( bvh );
			expect( serialized.version ).toBe( 1 );

			const deserialized = LineSegmentsBVH.deserialize( serialized, geometry );

			expect( deserialized ).toBeInstanceOf( LineSegmentsBVH );
			expect( deserialized._roots.length ).toBe( bvh._roots.length );

			for ( let i = 0; i < bvh._roots.length; i ++ ) {

				expect( new Uint8Array( bvh._roots[ i ] ) ).toEqual( new Uint8Array( deserialized._roots[ i ] ) );

			}

			expect( validateBounds( deserialized ) ).toBeTruthy();

		} );

		it( 'should produce identical shapecast results after deserialization.', () => {

			const serialized = LineSegmentsBVH.serialize( bvh );
			const deserialized = LineSegmentsBVH.deserialize( serialized, geometry );

			const queryBox = new Box3( new Vector3( - 2, - 2, - 2 ), new Vector3( 2, 2, 2 ) );

			const originalHits = [];
			bvh.shapecast( {
				intersectsBounds: box => queryBox.intersectsBox( box ),
				intersectsLine: ( line, index ) => {

					originalHits.push( index );

				},
			} );

			const deserializedHits = [];
			deserialized.shapecast( {
				intersectsBounds: box => queryBox.intersectsBox( box ),
				intersectsLine: ( line, index ) => {

					deserializedHits.push( index );

				},
			} );

			originalHits.sort( ( a, b ) => a - b );
			deserializedHits.sort( ( a, b ) => a - b );
			expect( deserializedHits ).toEqual( originalHits );

		} );

		it( 'should produce identical raycast results after deserialization.', () => {

			const serialized = LineSegmentsBVH.serialize( bvh );
			const deserialized = LineSegmentsBVH.deserialize( serialized, geometry );

			const raycaster = new Raycaster();
			raycaster.params.Line.threshold = 0.5;
			raycaster.ray.origin.set( 0, 0, 10 );
			raycaster.ray.direction.set( 0, 0, - 1 );
			raycaster.firstHitOnly = false;

			const originalHits = bvh.raycastObject3D( lineSegments, raycaster, [] );
			const deserializedHits = deserialized.raycastObject3D( lineSegments, raycaster, [] );

			expect( deserializedHits.length ).toBe( originalHits.length );

			originalHits.sort( ( a, b ) => a.distance - b.distance );
			deserializedHits.sort( ( a, b ) => a.distance - b.distance );
			for ( let i = 0; i < originalHits.length; i ++ ) {

				expect( deserializedHits[ i ].index ).toBe( originalHits[ i ].index );
				expect( deserializedHits[ i ].distance ).toBeCloseTo( originalHits[ i ].distance, 5 );

			}

		} );

		it( 'should work with indirect mode.', () => {

			const indirectBvh = new LineSegmentsBVH( geometry, { indirect: true } );
			const serialized = LineSegmentsBVH.serialize( indirectBvh );
			const deserialized = LineSegmentsBVH.deserialize( serialized, geometry );

			expect( deserialized.indirect ).toBe( true );
			expect( validateBounds( deserialized ) ).toBeTruthy();

		} );

	} );

	describe( 'LineLoopBVH', () => {

		it( 'should serialize and deserialize a LineLoopBVH.', () => {

			const geometry = new BufferGeometry();
			const positions = new Float32Array( 50 * 3 );
			for ( let i = 0; i < positions.length; i ++ ) {

				positions[ i ] = ( Math.random() - 0.5 ) * 10;

			}

			geometry.setAttribute( 'position', new Float32BufferAttribute( positions, 3 ) );

			const bvh = new LineLoopBVH( geometry );
			const serialized = LineLoopBVH.serialize( bvh );
			const deserialized = LineLoopBVH.deserialize( serialized, geometry );

			expect( deserialized ).toBeInstanceOf( LineLoopBVH );
			expect( deserialized.indirect ).toBe( true ); // LineLoop always indirect
			expect( validateBounds( deserialized ) ).toBeTruthy();

		} );

	} );

	describe( 'LineBVH', () => {

		it( 'should serialize and deserialize a LineBVH.', () => {

			const geometry = new BufferGeometry();
			const positions = new Float32Array( 50 * 3 );
			for ( let i = 0; i < positions.length; i ++ ) {

				positions[ i ] = ( Math.random() - 0.5 ) * 10;

			}

			geometry.setAttribute( 'position', new Float32BufferAttribute( positions, 3 ) );

			const bvh = new LineBVH( geometry );
			const serialized = LineBVH.serialize( bvh );
			const deserialized = LineBVH.deserialize( serialized, geometry );

			expect( deserialized ).toBeInstanceOf( LineBVH );
			expect( deserialized.indirect ).toBe( true );
			expect( validateBounds( deserialized ) ).toBeTruthy();

		} );

	} );

	describe( 'MeshBVH still works after refactor', () => {

		it( 'should serialize and deserialize MeshBVH correctly.', () => {

			const geometry = new SphereGeometry( 1, 16, 16 );
			const bvh = new MeshBVH( geometry );
			const serialized = MeshBVH.serialize( bvh );
			const deserialized = MeshBVH.deserialize( serialized, geometry );

			expect( deserialized ).toBeInstanceOf( MeshBVH );
			expect( validateBounds( deserialized ) ).toBeTruthy();

			// roots should match
			for ( let i = 0; i < bvh._roots.length; i ++ ) {

				expect( new Uint8Array( bvh._roots[ i ] ) ).toEqual( new Uint8Array( deserialized._roots[ i ] ) );

			}

		} );

		it( 'should still handle backwards compatibility for version 0.', () => {

			const geometry = new SphereGeometry( 1, 16, 16 );
			const bvh = new MeshBVH( geometry, { maxLeafSize: 5 } );
			const serialized = MeshBVH.serialize( bvh );

			// construct old version 0 data
			const oldSerialized = { ...serialized };
			delete oldSerialized.version;
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

			const deserializedBVH = MeshBVH.deserialize( oldSerialized, geometry.clone() );
			expect( deserializedBVH ).toEqualBVH( bvh );

		} );

	} );

} );

describe( 'ObjectBVH Serialization', () => {

	let scene, bvh, objects;

	beforeEach( () => {

		scene = new Scene();
		objects = [];

		// Add regular meshes
		for ( let i = 0; i < 5; i ++ ) {

			const mesh = new Mesh(
				new SphereGeometry( 0.5, 8, 8 ),
				new MeshBasicMaterial(),
			);
			mesh.position.set(
				( Math.random() - 0.5 ) * 10,
				( Math.random() - 0.5 ) * 10,
				( Math.random() - 0.5 ) * 10,
			);
			mesh.updateMatrix();
			scene.add( mesh );
			objects.push( mesh );

		}

		scene.updateMatrixWorld( true );

		bvh = new ObjectBVH( scene, { matrixWorld: scene.matrixWorld } );

	} );

	it( 'should serialize and deserialize with an object array.', () => {

		const serialized = ObjectBVH.serialize( bvh );

		expect( serialized.version ).toBe( 1 );
		expect( serialized.objectIds.length ).toBe( bvh.objects.length );
		expect( serialized.idBits ).toBe( bvh.idBits );
		expect( serialized.idMask ).toBe( bvh.idMask );

		const deserialized = ObjectBVH.deserialize( serialized, bvh.objects );

		expect( deserialized ).toBeInstanceOf( ObjectBVH );
		expect( deserialized.objects ).toEqual( bvh.objects );
		expect( deserialized.idBits ).toBe( bvh.idBits );
		expect( deserialized.idMask ).toBe( bvh.idMask );
		expect( deserialized.precise ).toBe( bvh.precise );
		expect( deserialized.includeInstances ).toBe( bvh.includeInstances );

		// roots should match
		for ( let i = 0; i < bvh._roots.length; i ++ ) {

			expect( new Uint8Array( bvh._roots[ i ] ) ).toEqual( new Uint8Array( deserialized._roots[ i ] ) );

		}

		// primitiveBuffer should match
		expect( new Uint32Array( deserialized.primitiveBuffer ) ).toEqual( new Uint32Array( bvh.primitiveBuffer ) );

	} );

	it( 'should serialize and deserialize with a resolver function.', () => {

		const serialized = ObjectBVH.serialize( bvh );

		const uuidMap = new Map();
		bvh.objects.forEach( obj => uuidMap.set( obj.uuid, obj ) );

		const deserialized = ObjectBVH.deserialize(
			serialized,
			uuid => uuidMap.get( uuid ),
		);

		expect( deserialized.objects ).toEqual( bvh.objects );

	} );

	it( 'should throw if resolver cannot find an object.', () => {

		const serialized = ObjectBVH.serialize( bvh );

		expect( () => {

			ObjectBVH.deserialize( serialized, () => null );

		} ).toThrow( /Could not resolve object/ );

	} );

	it( 'should throw if array length mismatches.', () => {

		const serialized = ObjectBVH.serialize( bvh );

		expect( () => {

			ObjectBVH.deserialize( serialized, [ objects[ 0 ] ] );

		} ).toThrow( /Expected/ );

	} );

	it( 'should produce identical shapecast results after deserialization.', () => {

		const serialized = ObjectBVH.serialize( bvh );
		const deserialized = ObjectBVH.deserialize( serialized, bvh.objects );

		const queryBox = new Box3( new Vector3( - 5, - 5, - 5 ), new Vector3( 5, 5, 5 ) );

		const originalHits = [];
		bvh.shapecast( {
			intersectsBounds: box => queryBox.intersectsBox( box ),
			intersectsObject: ( object, instanceId ) => {

				originalHits.push( { uuid: object.uuid, instanceId } );

			},
		} );

		const deserializedHits = [];
		deserialized.shapecast( {
			intersectsBounds: box => queryBox.intersectsBox( box ),
			intersectsObject: ( object, instanceId ) => {

				deserializedHits.push( { uuid: object.uuid, instanceId } );

			},
		} );

		originalHits.sort( ( a, b ) => a.uuid.localeCompare( b.uuid ) );
		deserializedHits.sort( ( a, b ) => a.uuid.localeCompare( b.uuid ) );
		expect( deserializedHits ).toEqual( originalHits );

	} );

	it( 'should produce identical raycast results after deserialization.', () => {

		const serialized = ObjectBVH.serialize( bvh );
		const deserialized = ObjectBVH.deserialize( serialized, bvh.objects );

		const raycaster = new Raycaster();
		raycaster.ray.origin.set( 0, 0, 20 );
		raycaster.ray.direction.set( 0, 0, - 1 );
		raycaster.firstHitOnly = false;

		const originalHits = bvh.raycast( raycaster, [] );
		const deserializedHits = deserialized.raycast( raycaster, [] );

		expect( deserializedHits.length ).toBe( originalHits.length );

		originalHits.sort( ( a, b ) => a.distance - b.distance );
		deserializedHits.sort( ( a, b ) => a.distance - b.distance );
		for ( let i = 0; i < originalHits.length; i ++ ) {

			expect( deserializedHits[ i ].object.uuid ).toBe( originalHits[ i ].object.uuid );
			expect( deserializedHits[ i ].distance ).toBeCloseTo( originalHits[ i ].distance, 5 );

		}

	} );

	it( 'should have getObjectFromId and getInstanceFromId work after deserialization.', () => {

		const serialized = ObjectBVH.serialize( bvh );
		const deserialized = ObjectBVH.deserialize( serialized, bvh.objects );

		// iterate all composite IDs in the primitiveBuffer and check they resolve correctly
		for ( let i = 0; i < bvh.primitiveBuffer.length; i ++ ) {

			const compositeId = bvh.primitiveBuffer[ i ];
			const originalObj = bvh.getObjectFromId( compositeId );
			const deserializedObj = deserialized.getObjectFromId( compositeId );

			expect( deserializedObj ).toBe( originalObj );
			expect( deserialized.getInstanceFromId( compositeId ) ).toBe( bvh.getInstanceFromId( compositeId ) );

		}

	} );

	it( 'should respect cloneBuffers option.', () => {

		const cloned = ObjectBVH.serialize( bvh, { cloneBuffers: true } );
		expect( cloned.roots ).not.toBe( bvh._roots );
		expect( cloned.roots[ 0 ] ).not.toBe( bvh._roots[ 0 ] );
		expect( cloned.primitiveBuffer ).not.toBe( bvh.primitiveBuffer );

		const shared = ObjectBVH.serialize( bvh, { cloneBuffers: false } );
		expect( shared.roots ).toBe( bvh._roots );
		expect( shared.roots[ 0 ] ).toBe( bvh._roots[ 0 ] );
		expect( shared.primitiveBuffer ).toBe( bvh.primitiveBuffer );

	} );

	it( 'should warn on idBits mismatch.', () => {

		const serialized = ObjectBVH.serialize( bvh );
		// tamper with idBits
		serialized.idBits = 999;

		const warnSpy = vi.spyOn( console, 'warn' ).mockImplementation( () => {} );
		ObjectBVH.deserialize( serialized, bvh.objects );
		expect( warnSpy ).toHaveBeenCalledWith( expect.stringContaining( 'idBits mismatch' ) );
		warnSpy.mockRestore();

	} );

	it( 'should work with precise mode.', () => {

		const preciseBvh = new ObjectBVH( scene, { precise: true, matrixWorld: scene.matrixWorld } );
		const serialized = ObjectBVH.serialize( preciseBvh );
		const deserialized = ObjectBVH.deserialize( serialized, preciseBvh.objects );

		expect( deserialized.precise ).toBe( true );

	} );

} );

describe( 'ObjectBVH Worker Utilities', () => {

	it( 'should build and roundtrip an ObjectBVH from serialized entries.', async () => {

		const {
			describeObject,
			buildObjectBVHFromEntries,
			getObjectBVHTransferables,
		} = await import( '../src/utils/ObjectBVHWorkerUtils.js' );

		const scene = new Scene();
		const objects = [];
		for ( let i = 0; i < 4; i ++ ) {

			const mesh = new Mesh( new SphereGeometry( 0.5, 6, 6 ), new MeshBasicMaterial() );
			mesh.position.set( i * 3, 0, 0 );
			mesh.updateMatrix();
			mesh.updateMatrixWorld( true );
			if ( mesh.geometry && ! mesh.geometry.boundingBox ) mesh.geometry.computeBoundingBox();
			if ( mesh.geometry && ! mesh.geometry.boundingSphere ) mesh.geometry.computeBoundingSphere();
			scene.add( mesh );
			objects.push( mesh );

		}

		scene.updateMatrixWorld( true );

		// 1. Build original BVH from the scene
		const originalBvh = new ObjectBVH( scene, { matrixWorld: scene.matrixWorld } );

		// 2. Describe the objects
		const objectEntries = objects.map( describeObject );

		// 3. Build BVH from entries (simulating the worker)
		const serializedFromEntries = buildObjectBVHFromEntries( objectEntries );

		expect( serializedFromEntries.version ).toBe( 1 );
		expect( serializedFromEntries.objectIds.length ).toBe( objects.length );
		expect( serializedFromEntries.roots.length ).toBeGreaterThan( 0 );
		expect( serializedFromEntries.primitiveBuffer ).toBeTruthy();

		// 4. Check transferables are extractable
		const transferables = getObjectBVHTransferables( serializedFromEntries );
		expect( transferables.length ).toBeGreaterThan( 0 );

		// 5. Deserialize on the "main thread"
		const uuidMap = new Map( objects.map( o => [ o.uuid, o ] ) );
		const deserialized = ObjectBVH.deserialize(
			serializedFromEntries,
			uuid => uuidMap.get( uuid ),
			{ matrixWorld: new Matrix4() },
		);

		expect( deserialized.objects ).toEqual( objects );
		expect( deserialized.idBits ).toBe( originalBvh.idBits );

		// 6. Verify getObjectFromId works
		for ( let i = 0; i < deserialized.primitiveBuffer.length; i ++ ) {

			const compositeId = deserialized.primitiveBuffer[ i ];
			const obj = deserialized.getObjectFromId( compositeId );
			expect( objects ).toContain( obj );

		}

	} );

} );
