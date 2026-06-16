import { intersectTri } from '../../utils/ThreeRayIntersectUtilities.js';
import { setTriangle } from '../../utils/TriangleUtilities.js';

export function intersectTris( bvh, materialOrSide, ray, offset, count, intersections, near, far ) {

	const geometry = bvh.geometry;
	const resolvePrimitiveIndex = bvh.resolvePrimitiveIndex;
	for ( let i = offset, end = offset + count; i < end; i ++ ) {

		const vi = resolvePrimitiveIndex( i );
		intersectTri( geometry, materialOrSide, ray, vi, intersections, near, far );

	}

}

export function intersectClosestTri( bvh, materialOrSide, ray, offset, count, near, far ) {

	const geometry = bvh.geometry;
	const resolvePrimitiveIndex = bvh.resolvePrimitiveIndex;
	let dist = Infinity;
	let res = null;
	for ( let i = offset, end = offset + count; i < end; i ++ ) {

		const vi = resolvePrimitiveIndex( i );
		const intersection = intersectTri( geometry, materialOrSide, ray, vi, null, near, far );
		if ( intersection && intersection.distance < dist ) {

			res = intersection;
			dist = intersection.distance;

		}

	}

	return res;

}

export function iterateOverTriangles(
	offset,
	count,
	bvh,
	intersectsTriangleFunc,
	contained,
	depth,
	triangle
) {

	const geometry = bvh.geometry;
	const index = geometry.index;
	const pos = geometry.attributes.position;
	const resolvePrimitiveIndex = bvh.resolvePrimitiveIndex;
	for ( let i = offset, l = count + offset; i < l; i ++ ) {

		const tri = resolvePrimitiveIndex( i );
		setTriangle( triangle, tri * 3, index, pos );
		triangle.needsUpdate = true;

		if ( intersectsTriangleFunc( triangle, tri, contained, depth ) ) {

			return true;

		}

	}

	return false;

}
