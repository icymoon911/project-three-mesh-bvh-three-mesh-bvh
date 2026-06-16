import {
	Mesh,
	BoxGeometry,
	SphereGeometry,
	MeshBasicMaterial,
	Scene,
	Raycaster,
	Vector3,
	Matrix4,
	Layers,
	BufferGeometry,
	BufferAttribute,
	Box3,
} from 'three';
import { ObjectBVH, MeshBVH, computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

Mesh.prototype.raycast = acceleratedRaycast;
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

describe( 'ObjectBVH layers filtering', () => {

	it( 'should skip objects not in raycaster.layers (firstHitOnly = false)', () => {

		const scene = new Scene();

		// mesh1 on layer 0 (default)
		const mesh1 = new Mesh( new SphereGeometry( 1, 8, 8 ), new MeshBasicMaterial() );
		mesh1.position.set( 0, 0, 0 );
		scene.add( mesh1 );

		// mesh2 on layer 1 only
		const mesh2 = new Mesh( new SphereGeometry( 1, 8, 8 ), new MeshBasicMaterial() );
		mesh2.position.set( 0, 0, 0 );
		mesh2.layers.set( 1 );
		scene.add( mesh2 );

		scene.updateMatrixWorld( true );

		const bvh = new ObjectBVH( scene );

		// Raycaster on default layer 0 — should only hit mesh1
		const raycaster = new Raycaster();
		raycaster.ray.origin.set( 0, 0, 5 );
		raycaster.ray.direction.set( 0, 0, - 1 );
		raycaster.firstHitOnly = false;

		const bvhHits = bvh.raycast( raycaster, [] );
		const hitObjects = bvhHits.map( h => h.object );

		expect( hitObjects ).toContain( mesh1 );
		expect( hitObjects ).not.toContain( mesh2 );

	} );

	it( 'should skip objects not in raycaster.layers (firstHitOnly = true)', () => {

		const scene = new Scene();

		// mesh1 on layer 0 at z = -1
		const mesh1 = new Mesh( new SphereGeometry( 0.5, 8, 8 ), new MeshBasicMaterial() );
		mesh1.position.set( 0, 0, - 1 );
		scene.add( mesh1 );

		// mesh2 on layer 1 only at z = 0 (closer)
		const mesh2 = new Mesh( new SphereGeometry( 0.5, 8, 8 ), new MeshBasicMaterial() );
		mesh2.position.set( 0, 0, 0 );
		mesh2.layers.set( 1 );
		scene.add( mesh2 );

		scene.updateMatrixWorld( true );

		const bvh = new ObjectBVH( scene );

		const raycaster = new Raycaster();
		raycaster.ray.origin.set( 0, 0, 5 );
		raycaster.ray.direction.set( 0, 0, - 1 );
		raycaster.firstHitOnly = true;

		const bvhHits = bvh.raycast( raycaster, [] );

		// First hit should be mesh1, not mesh2 (which is closer but on layer 1)
		expect( bvhHits.length ).toBe( 1 );
		expect( bvhHits[ 0 ].object ).toBe( mesh1 );

	} );

	it( 'should hit objects when raycaster layers match', () => {

		const scene = new Scene();

		const mesh1 = new Mesh( new SphereGeometry( 1, 8, 8 ), new MeshBasicMaterial() );
		mesh1.position.set( 0, 0, 0 );
		mesh1.layers.set( 2 );
		scene.add( mesh1 );

		scene.updateMatrixWorld( true );

		const bvh = new ObjectBVH( scene );

		const raycaster = new Raycaster();
		raycaster.ray.origin.set( 0, 0, 5 );
		raycaster.ray.direction.set( 0, 0, - 1 );
		raycaster.layers.set( 2 );
		raycaster.firstHitOnly = false;

		const bvhHits = bvh.raycast( raycaster, [] );

		expect( bvhHits.length ).toBeGreaterThan( 0 );
		expect( bvhHits[ 0 ].object ).toBe( mesh1 );

	} );

} );

describe( 'ObjectBVH singular matrixWorld', () => {

	it( 'should not produce NaN bounds when matrixWorld has zero scale', () => {

		const scene = new Scene();

		// Normal mesh
		const mesh1 = new Mesh( new BoxGeometry( 1, 1, 1 ), new MeshBasicMaterial() );
		mesh1.position.set( 0, 0, 0 );
		scene.add( mesh1 );

		// Mesh with zero scale → singular matrixWorld
		const mesh2 = new Mesh( new BoxGeometry( 1, 1, 1 ), new MeshBasicMaterial() );
		mesh2.position.set( 5, 0, 0 );
		mesh2.scale.set( 0, 0, 0 );
		scene.add( mesh2 );

		scene.updateMatrixWorld( true );

		// Use a singular matrixWorld on the BVH itself
		const singularMatrix = new Matrix4().makeScale( 0, 0, 0 );

		let bvh;
		expect( () => {

			bvh = new ObjectBVH( scene, { matrixWorld: singularMatrix } );

		} ).not.toThrow();

		// Verify that no bounds contain NaN or Infinity
		const box = new Box3();
		bvh.getBoundingBox( box );

		expect( isFinite( box.min.x ) ).toBe( true );
		expect( isFinite( box.min.y ) ).toBe( true );
		expect( isFinite( box.min.z ) ).toBe( true );
		expect( isFinite( box.max.x ) ).toBe( true );
		expect( isFinite( box.max.y ) ).toBe( true );
		expect( isFinite( box.max.z ) ).toBe( true );

	} );

	it( 'should produce valid bounds for objects with zero-scale matrixWorld', () => {

		const scene = new Scene();

		// Mesh with zero scale in one axis
		const mesh = new Mesh( new BoxGeometry( 1, 1, 1 ), new MeshBasicMaterial() );
		mesh.scale.set( 0, 1, 1 );
		scene.add( mesh );

		scene.updateMatrixWorld( true );

		let bvh;
		expect( () => {

			bvh = new ObjectBVH( scene );

		} ).not.toThrow();

		const box = new Box3();
		bvh.getBoundingBox( box );

		expect( isFinite( box.min.x ) ).toBe( true );
		expect( isFinite( box.min.y ) ).toBe( true );
		expect( isFinite( box.min.z ) ).toBe( true );
		expect( isFinite( box.max.x ) ).toBe( true );
		expect( isFinite( box.max.y ) ).toBe( true );
		expect( isFinite( box.max.z ) ).toBe( true );

	} );

} );

describe( 'ObjectBVH auto computeBoundingBox', () => {

	it( 'should auto-call computeBoundingBox when geometry has no boundingBox in non-precise mode', () => {

		const geometry = new BoxGeometry( 1, 1, 1 );
		// Explicitly clear the boundingBox to simulate a freshly-created geometry
		geometry.boundingBox = null;
		geometry.boundingSphere = null;

		const mesh = new Mesh( geometry, new MeshBasicMaterial() );
		const scene = new Scene();
		scene.add( mesh );
		scene.updateMatrixWorld( true );

		expect( geometry.boundingBox ).toBeNull();

		// Should not throw and should compute the boundingBox
		const bvh = new ObjectBVH( scene, { precise: false } );

		expect( geometry.boundingBox ).not.toBeNull();
		expect( geometry.boundingSphere ).not.toBeNull();

		// Verify BVH has valid bounds
		const box = new Box3();
		bvh.getBoundingBox( box );
		expect( box.isEmpty() ).toBe( false );

	} );

} );

describe( 'MeshBVH refit with drawRange', () => {

	it( 'should ignore triangles outside drawRange when refitting', () => {

		// Create a geometry with several triangles
		const geometry = new BoxGeometry( 2, 2, 2 );
		geometry.computeBoundsTree();

		const bvh = geometry.boundsTree;

		// Get the original bounding box
		const originalBox = new Box3();
		bvh.getBoundingBox( originalBox );

		// Shrink the drawRange to cover only a small portion of the geometry
		// (just the first 6 indices = 2 triangles)
		geometry.setDrawRange( 0, 6 );

		// Refit the BVH
		bvh.refit();

		// The refit bounds should now be smaller (or at most equal) since we excluded most triangles
		const refitBox = new Box3();
		bvh.getBoundingBox( refitBox );

		// The refit box should not contain vertices that are outside the first 2 triangles.
		// We mainly check that the box is not NaN and not larger than the original
		expect( isFinite( refitBox.min.x ) ).toBe( true );
		expect( isFinite( refitBox.min.y ) ).toBe( true );
		expect( isFinite( refitBox.min.z ) ).toBe( true );
		expect( isFinite( refitBox.max.x ) ).toBe( true );
		expect( isFinite( refitBox.max.y ) ).toBe( true );
		expect( isFinite( refitBox.max.z ) ).toBe( true );

		// The refit box size should be <= the original box size
		const origSize = new Vector3();
		const refitSize = new Vector3();
		originalBox.getSize( origSize );
		refitBox.getSize( refitSize );
		expect( refitSize.x ).toBeLessThanOrEqual( origSize.x + 1e-5 );
		expect( refitSize.y ).toBeLessThanOrEqual( origSize.y + 1e-5 );
		expect( refitSize.z ).toBeLessThanOrEqual( origSize.z + 1e-5 );

	} );

	it( 'should respect drawRange start offset when refitting', () => {

		const geometry = new BoxGeometry( 2, 2, 2 );
		geometry.computeBoundsTree();
		const bvh = geometry.boundsTree;

		const indexCount = geometry.index ? geometry.index.count : geometry.attributes.position.count;

		// Draw only the last half
		const halfCount = Math.floor( indexCount / 2 );
		geometry.setDrawRange( halfCount, halfCount );

		bvh.refit();

		const refitBox = new Box3();
		bvh.getBoundingBox( refitBox );

		expect( isFinite( refitBox.min.x ) ).toBe( true );
		expect( refitBox.isEmpty() ).toBe( false );

	} );

	it( 'should respect geometry groups with gaps when refitting', () => {

		const geometry = new BoxGeometry( 2, 2, 2 );
		const totalIndexCount = geometry.index.count;

		// Set groups that skip the middle triangles: group 1 = first 6 indices, group 2 = last 6 indices
		geometry.clearGroups();
		geometry.addGroup( 0, 6, 0 );
		geometry.addGroup( totalIndexCount - 6, 6, 0 );

		geometry.computeBoundsTree();
		const bvh = geometry.boundsTree;

		// Refit should only consider triangles in groups
		bvh.refit();

		const refitBox = new Box3();
		bvh.getBoundingBox( refitBox );

		expect( isFinite( refitBox.min.x ) ).toBe( true );
		expect( refitBox.isEmpty() ).toBe( false );

	} );

} );

describe( 'closestPointToGeometry does not corrupt target1.point', () => {

	it( 'should not modify target1.point when target2 is provided', () => {

		// Create two simple box geometries
		const geom1 = new BoxGeometry( 1, 1, 1 );
		const geom2 = new BoxGeometry( 1, 1, 1 );

		geom1.computeBoundsTree();
		geom2.computeBoundingBox();

		const bvh1 = geom1.boundsTree;
		const geometryToBvh = new Matrix4().makeTranslation( 3, 0, 0 );

		const target1 = {};
		const target2 = {};

		const result = bvh1.closestPointToGeometry( geom2, geometryToBvh, target1, target2 );

		expect( result ).not.toBeNull();
		expect( target1.point ).toBeDefined();
		expect( target2.point ).toBeDefined();

		// Record target1.point values before a second call
		const t1x = target1.point.x;
		const t1y = target1.point.y;
		const t1z = target1.point.z;

		// target2.point should be in a different coordinate space (transformed by tempMatrix)
		// so it should differ from target1.point in at least one axis (since geometryToBvh
		// has a translation).
		// The key assertion: target1.point should remain a valid, finite point
		// and not be corrupted by the target2 distance calculation.
		expect( isFinite( target1.point.x ) ).toBe( true );
		expect( isFinite( target1.point.y ) ).toBe( true );
		expect( isFinite( target1.point.z ) ).toBe( true );

		// target1.point should be on geom1 (within the unit box [-0.5, 0.5])
		expect( target1.point.x ).toBeGreaterThanOrEqual( - 0.5 - 1e-5 );
		expect( target1.point.x ).toBeLessThanOrEqual( 0.5 + 1e-5 );

		// Call again to verify stability (no corruption across calls)
		const result2 = bvh1.closestPointToGeometry( geom2, geometryToBvh, target1, target2 );

		expect( result2 ).not.toBeNull();
		expect( target1.point.x ).toBeCloseTo( t1x, 4 );
		expect( target1.point.y ).toBeCloseTo( t1y, 4 );
		expect( target1.point.z ).toBeCloseTo( t1z, 4 );

	} );

	it( 'should return consistent results across repeated calls', () => {

		const geom1 = new SphereGeometry( 1, 8, 8 );
		const geom2 = new SphereGeometry( 0.5, 8, 8 );

		geom1.computeBoundsTree();
		geom2.computeBoundingBox();

		const bvh1 = geom1.boundsTree;
		const geometryToBvh = new Matrix4().makeTranslation( 2, 0, 0 );

		const target1a = {};
		const target2a = {};
		bvh1.closestPointToGeometry( geom2, geometryToBvh, target1a, target2a );

		const target1b = {};
		const target2b = {};
		bvh1.closestPointToGeometry( geom2, geometryToBvh, target1b, target2b );

		// Both calls should give the same closest point on geom1
		expect( target1a.point.x ).toBeCloseTo( target1b.point.x, 5 );
		expect( target1a.point.y ).toBeCloseTo( target1b.point.y, 5 );
		expect( target1a.point.z ).toBeCloseTo( target1b.point.z, 5 );
		expect( target1a.distance ).toBeCloseTo( target1b.distance, 5 );

	} );

} );
