import {
	Mesh,
	BoxGeometry,
	SphereGeometry,
	MeshBasicMaterial,
	Scene,
	Raycaster,
	Vector3,
	Group,
	BufferGeometry,
	BufferAttribute,
	Matrix4,
} from 'three';
import { ObjectBVH, MeshBVH, CENTER } from 'three-mesh-bvh';

describe( 'Fix #1: ObjectBVH.raycast layers filtering', () => {

	it( 'should skip objects whose layers do not match the raycaster (firstHitOnly = false)', () => {

		const scene = new Scene();

		// Two meshes at the same position; one on layer 0 (default), one on layer 1
		const meshOnLayer0 = new Mesh( new BoxGeometry( 1, 1, 1 ), new MeshBasicMaterial() );
		meshOnLayer0.position.set( 0, 0, - 5 );
		meshOnLayer0.layers.set( 0 );

		const meshOnLayer1 = new Mesh( new BoxGeometry( 1, 1, 1 ), new MeshBasicMaterial() );
		meshOnLayer1.position.set( 0, 0, - 5 );
		meshOnLayer1.layers.set( 1 );

		scene.add( meshOnLayer0 );
		scene.add( meshOnLayer1 );
		scene.updateMatrixWorld( true );

		const bvh = new ObjectBVH( scene );

		const raycaster = new Raycaster();
		raycaster.ray.origin.set( 0, 0, 10 );
		raycaster.ray.direction.set( 0, 0, - 1 );
		raycaster.layers.set( 0 ); // only layer 0
		raycaster.firstHitOnly = false;

		const hits = bvh.raycast( raycaster );

		// Should only hit meshOnLayer0, not meshOnLayer1
		expect( hits.length ).toBeGreaterThan( 0 );
		for ( const hit of hits ) {

			expect( hit.object ).toBe( meshOnLayer0 );

		}

	} );

	it( 'should skip objects whose layers do not match the raycaster (firstHitOnly = true)', () => {

		const scene = new Scene();

		// Mesh on layer 1 is CLOSER to the ray origin, but raycaster only sees layer 0
		const meshOnLayer1 = new Mesh( new BoxGeometry( 1, 1, 1 ), new MeshBasicMaterial() );
		meshOnLayer1.position.set( 0, 0, - 3 );
		meshOnLayer1.layers.set( 1 );

		const meshOnLayer0 = new Mesh( new BoxGeometry( 1, 1, 1 ), new MeshBasicMaterial() );
		meshOnLayer0.position.set( 0, 0, - 6 );
		meshOnLayer0.layers.set( 0 );

		scene.add( meshOnLayer1 );
		scene.add( meshOnLayer0 );
		scene.updateMatrixWorld( true );

		const bvh = new ObjectBVH( scene );

		const raycaster = new Raycaster();
		raycaster.ray.origin.set( 0, 0, 10 );
		raycaster.ray.direction.set( 0, 0, - 1 );
		raycaster.layers.set( 0 );
		raycaster.firstHitOnly = true;

		const hits = bvh.raycast( raycaster );

		expect( hits.length ).toBe( 1 );
		expect( hits[ 0 ].object ).toBe( meshOnLayer0 );

	} );

	it( 'should return no hits when no objects match the raycaster layers', () => {

		const scene = new Scene();

		const mesh = new Mesh( new BoxGeometry( 1, 1, 1 ), new MeshBasicMaterial() );
		mesh.position.set( 0, 0, - 5 );
		mesh.layers.set( 2 );

		scene.add( mesh );
		scene.updateMatrixWorld( true );

		const bvh = new ObjectBVH( scene );

		const raycaster = new Raycaster();
		raycaster.ray.origin.set( 0, 0, 10 );
		raycaster.ray.direction.set( 0, 0, - 1 );
		raycaster.layers.set( 0 );
		raycaster.firstHitOnly = false;

		const hits = bvh.raycast( raycaster );
		expect( hits.length ).toBe( 0 );

	} );

	it( 'should hit objects when raycaster enables multiple layers', () => {

		const scene = new Scene();

		// All meshes centered on the ray's path (0, 0, z)
		const meshA = new Mesh( new BoxGeometry( 2, 2, 2 ), new MeshBasicMaterial() );
		meshA.position.set( 0, 0, - 3 );
		meshA.layers.set( 0 );

		const meshB = new Mesh( new BoxGeometry( 2, 2, 2 ), new MeshBasicMaterial() );
		meshB.position.set( 0, 0, - 6 );
		meshB.layers.set( 1 );

		const meshC = new Mesh( new BoxGeometry( 2, 2, 2 ), new MeshBasicMaterial() );
		meshC.position.set( 0, 0, - 9 );
		meshC.layers.set( 2 );

		scene.add( meshA );
		scene.add( meshB );
		scene.add( meshC );
		scene.updateMatrixWorld( true );

		const bvh = new ObjectBVH( scene );

		const raycaster = new Raycaster();
		raycaster.ray.origin.set( 0, 0, 10 );
		raycaster.ray.direction.set( 0, 0, - 1 );
		raycaster.layers.enable( 0 );
		raycaster.layers.enable( 1 );
		raycaster.firstHitOnly = false;

		const hits = bvh.raycast( raycaster );

		// meshA and meshB should be hit, but not meshC
		const hitObjects = new Set( hits.map( h => h.object ) );
		expect( hitObjects.has( meshA ) ).toBe( true );
		expect( hitObjects.has( meshB ) ).toBe( true );
		expect( hitObjects.has( meshC ) ).toBe( false );

	} );

} );

describe( 'Fix #2: ObjectBVH singular matrix protection', () => {

	it( 'should build a valid BVH when an object has zero scale (singular matrixWorld)', () => {

		const scene = new Scene();

		const normalMesh = new Mesh( new BoxGeometry( 1, 1, 1 ), new MeshBasicMaterial() );
		normalMesh.position.set( 0, 0, - 5 );

		const zeroScaleMesh = new Mesh( new BoxGeometry( 1, 1, 1 ), new MeshBasicMaterial() );
		zeroScaleMesh.position.set( 2, 0, - 5 );
		zeroScaleMesh.scale.set( 0, 0, 0 ); // singular matrixWorld

		scene.add( normalMesh );
		scene.add( zeroScaleMesh );
		scene.updateMatrixWorld( true );

		// This should not throw and should produce a valid BVH (no NaN in bounds)
		const bvh = new ObjectBVH( scene );

		// Verify that the BVH tree does not contain NaN bounds
		let hasNaN = false;
		bvh.traverse( ( depth, isLeaf, boundingData ) => {

			for ( let i = 0; i < 6; i ++ ) {

				if ( ! isFinite( boundingData[ i ] ) ) {

					hasNaN = true;

				}

			}

		} );

		expect( hasNaN ).toBe( false );

		// Verify the normal mesh can still be raycast
		const raycaster = new Raycaster();
		raycaster.ray.origin.set( 0, 0, 10 );
		raycaster.ray.direction.set( 0, 0, - 1 );
		raycaster.firstHitOnly = false;

		const hits = bvh.raycast( raycaster );
		const hitObjects = hits.map( h => h.object );
		expect( hitObjects ).toContain( normalMesh );

	} );

	it( 'should build a valid BVH when an object has zero scale on one axis', () => {

		const scene = new Scene();

		const mesh = new Mesh( new SphereGeometry( 1, 8, 8 ), new MeshBasicMaterial() );
		mesh.scale.set( 1, 0, 1 ); // zero Y scale => singular matrix

		scene.add( mesh );
		scene.updateMatrixWorld( true );

		// Should not throw
		const bvh = new ObjectBVH( scene );

		// Should not contain NaN
		let hasNaN = false;
		bvh.traverse( ( depth, isLeaf, boundingData ) => {

			for ( let i = 0; i < 6; i ++ ) {

				if ( ! isFinite( boundingData[ i ] ) ) {

					hasNaN = true;

				}

			}

		} );

		expect( hasNaN ).toBe( false );

	} );

} );

describe( 'Fix #3: MeshBVH.refit respects drawRange', () => {

	it( 'should not expand bounds for triangles outside the current drawRange', () => {

		// Create a geometry with two separate triangles
		const geometry = new BufferGeometry();
		const vertices = new Float32Array( [
			// Triangle 0: near origin
			0, 0, 0,
			1, 0, 0,
			0, 1, 0,
			// Triangle 1: far away
			100, 100, 100,
			101, 100, 100,
			100, 101, 100,
		] );
		geometry.setAttribute( 'position', new BufferAttribute( vertices, 3 ) );
		geometry.setIndex( [ 0, 1, 2, 3, 4, 5 ] );

		const bvh = new MeshBVH( geometry, { strategy: CENTER, maxLeafSize: 1 } );

		// Initially the bounds should encompass both triangles
		const rootBoundsBefore = getRootBounds( bvh );
		expect( rootBoundsBefore.maxX ).toBeGreaterThanOrEqual( 100 );

		// Now shrink the drawRange to only include the first triangle
		geometry.setDrawRange( 0, 3 );

		// Refit — the bounds should now only cover triangle 0
		bvh.refit();

		const rootBoundsAfter = getRootBounds( bvh );

		// The bounds should not extend to the far triangle anymore
		// (since it's outside the drawRange)
		expect( rootBoundsAfter.maxX ).toBeLessThan( 50 );

	} );

	it( 'should handle groups with gaps correctly during refit', () => {

		const geometry = new BufferGeometry();
		const vertices = new Float32Array( [
			// Triangle 0 (group 0): near origin
			0, 0, 0,
			1, 0, 0,
			0, 1, 0,
			// Triangle 1 (gap - no group): far away
			100, 100, 100,
			101, 100, 100,
			100, 101, 100,
			// Triangle 2 (group 1): near origin
			2, 0, 0,
			3, 0, 0,
			2, 1, 0,
		] );
		geometry.setAttribute( 'position', new BufferAttribute( vertices, 3 ) );
		geometry.setIndex( [ 0, 1, 2, 3, 4, 5, 6, 7, 8 ] );

		// Set groups: group 0 covers triangle 0 (indices 0-2), group 1 covers triangle 2 (indices 6-8)
		// Triangle 1 (indices 3-5) is in the gap
		geometry.addGroup( 0, 3, 0 );
		geometry.addGroup( 6, 3, 1 );

		const bvh = new MeshBVH( geometry, { strategy: CENTER, maxLeafSize: 1 } );

		// Refit should only use triangles in groups, not the gap triangle
		bvh.refit();

		const rootBounds = getRootBounds( bvh );

		// The bounds should not extend to the far triangle (100, 100, 100)
		expect( rootBounds.maxX ).toBeLessThan( 50 );

	} );

} );

describe( 'Fix #4: ObjectBVH ensures boundingBox is computed in precise=false mode', () => {

	it( 'should automatically compute boundingBox for geometries without one', () => {

		const scene = new Scene();
		const geometry = new BoxGeometry( 1, 1, 1 );

		// Explicitly clear the boundingBox
		geometry.boundingBox = null;
		expect( geometry.boundingBox ).toBeNull();

		const mesh = new Mesh( geometry, new MeshBasicMaterial() );
		mesh.position.set( 0, 0, - 5 );
		scene.add( mesh );
		scene.updateMatrixWorld( true );

		// Building with precise=false should auto-compute boundingBox
		const bvh = new ObjectBVH( scene, { precise: false } );

		// The geometry's boundingBox should now be computed
		expect( geometry.boundingBox ).not.toBeNull();

		// The BVH should be valid (no NaN bounds)
		let hasNaN = false;
		bvh.traverse( ( depth, isLeaf, boundingData ) => {

			for ( let i = 0; i < 6; i ++ ) {

				if ( ! isFinite( boundingData[ i ] ) ) {

					hasNaN = true;

				}

			}

		} );

		expect( hasNaN ).toBe( false );

	} );

	it( 'should produce correct raycast results after auto-computing boundingBox', () => {

		const scene = new Scene();
		const geometry = new SphereGeometry( 1, 16, 16 );
		geometry.boundingBox = null;

		const mesh = new Mesh( geometry, new MeshBasicMaterial() );
		mesh.position.set( 0, 0, - 5 );
		scene.add( mesh );
		scene.updateMatrixWorld( true );

		const bvh = new ObjectBVH( scene, { precise: false } );

		const raycaster = new Raycaster();
		raycaster.ray.origin.set( 0, 0, 10 );
		raycaster.ray.direction.set( 0, 0, - 1 );
		raycaster.firstHitOnly = false;

		const hits = bvh.raycast( raycaster );
		expect( hits.length ).toBeGreaterThan( 0 );
		expect( hits[ 0 ].object ).toBe( mesh );

	} );

} );

describe( 'Fix #5: closestPointToGeometry does not corrupt target1 via target2 computation', () => {

	it( 'should not modify target1.point when computing target2.distance', () => {

		// Create two simple triangle geometries
		const geom1 = new BufferGeometry();
		geom1.setAttribute( 'position', new BufferAttribute( new Float32Array( [
			0, 0, 0,
			1, 0, 0,
			0, 1, 0,
		] ), 3 ) );
		geom1.setIndex( [ 0, 1, 2 ] );

		const geom2 = new BufferGeometry();
		geom2.setAttribute( 'position', new BufferAttribute( new Float32Array( [
			5, 5, 5,
			6, 5, 5,
			5, 6, 5,
		] ), 3 ) );
		geom2.setIndex( [ 0, 1, 2 ] );

		const bvh1 = new MeshBVH( geom1 );

		const target1 = { point: new Vector3(), distance: 0, faceIndex: 0 };
		const target2 = { point: new Vector3(), distance: 0, faceIndex: 0 };

		const matrix = new Matrix4().makeTranslation( 2, 0, 0 );

		const result = bvh1.closestPointToGeometry( geom1, matrix, target1, target2 );

		expect( result ).not.toBeNull();

		// Save target1.point before any further operations
		const target1PointX = target1.point.x;
		const target1PointY = target1.point.y;
		const target1PointZ = target1.point.z;

		// target1.point should be on the first geometry (geom1, in its local space)
		// The closest point on triangle 1 should be a valid finite point
		expect( isFinite( target1PointX ) ).toBe( true );
		expect( isFinite( target1PointY ) ).toBe( true );
		expect( isFinite( target1PointZ ) ).toBe( true );

		// target2.point should be in the transformed space of geom2
		expect( isFinite( target2.point.x ) ).toBe( true );
		expect( isFinite( target2.point.y ) ).toBe( true );
		expect( isFinite( target2.point.z ) ).toBe( true );

		// target2.distance should be a positive finite number
		expect( isFinite( target2.distance ) ).toBe( true );
		expect( target2.distance ).toBeGreaterThan( 0 );

	} );

	it( 'should produce consistent results when called multiple times', () => {

		const geom1 = new BufferGeometry();
		geom1.setAttribute( 'position', new BufferAttribute( new Float32Array( [
			0, 0, 0,
			1, 0, 0,
			0, 1, 0,
		] ), 3 ) );
		geom1.setIndex( [ 0, 1, 2 ] );

		const geom2 = new BufferGeometry();
		geom2.setAttribute( 'position', new BufferAttribute( new Float32Array( [
			3, 0, 0,
			4, 0, 0,
			3, 1, 0,
		] ), 3 ) );
		geom2.setIndex( [ 0, 1, 2 ] );

		const bvh1 = new MeshBVH( geom1 );
		const matrix = new Matrix4(); // identity

		// Call twice with target2 and verify target1.point is consistent
		const target1a = { point: new Vector3() };
		const target2a = { point: new Vector3() };
		bvh1.closestPointToGeometry( geom2, matrix, target1a, target2a );

		const target1b = { point: new Vector3() };
		const target2b = { point: new Vector3() };
		bvh1.closestPointToGeometry( geom2, matrix, target1b, target2b );

		// Both calls should produce the same target1.point
		expect( target1a.point.x ).toBeCloseTo( target1b.point.x, 10 );
		expect( target1a.point.y ).toBeCloseTo( target1b.point.y, 10 );
		expect( target1a.point.z ).toBeCloseTo( target1b.point.z, 10 );

		// And the same target2 values
		expect( target2a.point.x ).toBeCloseTo( target2b.point.x, 10 );
		expect( target2a.point.y ).toBeCloseTo( target2b.point.y, 10 );
		expect( target2a.point.z ).toBeCloseTo( target2b.point.z, 10 );
		expect( target2a.distance ).toBeCloseTo( target2b.distance, 10 );

	} );

} );

// Helper to extract the root node bounds from a BVH
function getRootBounds( bvh ) {

	let minX = Infinity, minY = Infinity, minZ = Infinity;
	let maxX = - Infinity, maxY = - Infinity, maxZ = - Infinity;

	bvh.traverse( ( depth, isLeaf, boundingData ) => {

		if ( depth === 0 ) {

			minX = boundingData[ 0 ];
			minY = boundingData[ 1 ];
			minZ = boundingData[ 2 ];
			maxX = boundingData[ 3 ];
			maxY = boundingData[ 4 ];
			maxZ = boundingData[ 5 ];

		}

	} );

	return { minX, minY, minZ, maxX, maxY, maxZ };

}
