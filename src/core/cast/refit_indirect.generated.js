import { UINT32_PER_NODE, BYTES_PER_NODE } from '../Constants.js';
import { IS_LEAF, OFFSET, COUNT, LEFT_NODE, RIGHT_NODE } from '../utils/nodeBufferUtils.js';

/****************************************************/
/* This file is generated from "refit.template.js". */
/****************************************************/

function refit_indirect( bvh, nodeIndices = null ) {

	if ( nodeIndices && Array.isArray( nodeIndices ) ) {

		nodeIndices = new Set( nodeIndices );

	}

	const geometry = bvh.geometry;
	const indexArr = geometry.index ? geometry.index.array : null;
	const posAttr = geometry.attributes.position;

	// Fix #3: pre-compute valid triangle ranges from drawRange and groups so that
	// refit can skip triangles that have fallen outside the current draw range or
	// that lie in gaps between geometry groups.
	const drawRange = geometry.drawRange;
	const groups = geometry.groups;
	const hasRangeRestriction = drawRange.start !== 0 || isFinite( drawRange.count );
	const hasGroups = groups && groups.length > 0;
	const needsRangeCheck = hasRangeRestriction || hasGroups;

	let validRanges = null;
	if ( needsRangeCheck ) {

		validRanges = [];
		const drStart = drawRange.start;
		const drEnd = isFinite( drawRange.count ) ? drawRange.start + drawRange.count : Infinity;

		if ( hasGroups ) {

			for ( let g = 0, gl = groups.length; g < gl; g ++ ) {

				const group = groups[ g ];
				const gStart = Math.max( group.start, drStart );
				const gCount = isFinite( group.count ) ? group.count : ( posAttr.count - group.start );
				const gEnd = Math.min( group.start + gCount, drEnd );
				if ( gStart < gEnd ) {

					validRanges.push( gStart / 3, gEnd / 3 );

				}

			}

		} else {

			validRanges.push( drStart / 3, drEnd / 3 );

		}

	}

	let buffer, uint32Array, uint16Array, float32Array;
	let byteOffset = 0;
	const roots = bvh._roots;
	for ( let i = 0, l = roots.length; i < l; i ++ ) {

		buffer = roots[ i ];
		uint32Array = new Uint32Array( buffer );
		uint16Array = new Uint16Array( buffer );
		float32Array = new Float32Array( buffer );

		_traverse( 0, byteOffset );
		byteOffset += buffer.byteLength;

	}

	function _traverse( nodeIndex32, byteOffset, force = false ) {

		const nodeIndex16 = nodeIndex32 * 2;
		if ( IS_LEAF( nodeIndex16, uint16Array ) ) {

			const offset = OFFSET( nodeIndex32, uint32Array );
			const count = COUNT( nodeIndex16, uint16Array );

			let minx = Infinity;
			let miny = Infinity;
			let minz = Infinity;
			let maxx = - Infinity;
			let maxy = - Infinity;
			let maxz = - Infinity;

			for ( let i = offset, l = offset + count; i < l; i ++ ) {

				const triIndex = bvh.resolveTriangleIndex( i );

				// Fix #3: skip triangles outside the current drawRange / group ranges
				if ( needsRangeCheck && ! _isTriangleValid( triIndex ) ) {

					continue;

				}

				const t = 3 * triIndex;
				for ( let j = 0; j < 3; j ++ ) {

					let index = t + j;
					index = indexArr ? indexArr[ index ] : index;

					const x = posAttr.getX( index );
					const y = posAttr.getY( index );
					const z = posAttr.getZ( index );

					if ( x < minx ) minx = x;
					if ( x > maxx ) maxx = x;

					if ( y < miny ) miny = y;
					if ( y > maxy ) maxy = y;

					if ( z < minz ) minz = z;
					if ( z > maxz ) maxz = z;


				}

			}


			if (
				float32Array[ nodeIndex32 + 0 ] !== minx ||
				float32Array[ nodeIndex32 + 1 ] !== miny ||
				float32Array[ nodeIndex32 + 2 ] !== minz ||

				float32Array[ nodeIndex32 + 3 ] !== maxx ||
				float32Array[ nodeIndex32 + 4 ] !== maxy ||
				float32Array[ nodeIndex32 + 5 ] !== maxz
			) {

				float32Array[ nodeIndex32 + 0 ] = minx;
				float32Array[ nodeIndex32 + 1 ] = miny;
				float32Array[ nodeIndex32 + 2 ] = minz;

				float32Array[ nodeIndex32 + 3 ] = maxx;
				float32Array[ nodeIndex32 + 4 ] = maxy;
				float32Array[ nodeIndex32 + 5 ] = maxz;

				return true;

			} else {

				return false;

			}

		} else {

			const left = LEFT_NODE( nodeIndex32 );
			const right = RIGHT_NODE( nodeIndex32, uint32Array );

			// the identifying node indices provided by the shapecast function include offsets of all
			// root buffers to guarantee they're unique between roots so offset left and right indices here.
			let forceChildren = force;
			let includesLeft = false;
			let includesRight = false;

			if ( nodeIndices ) {

				// if we see that neither the left or right child are included in the set that need to be updated
				// then we assume that all children need to be updated.
				if ( ! forceChildren ) {

					const leftNodeId = left / UINT32_PER_NODE + byteOffset / BYTES_PER_NODE;
					const rightNodeId = right / UINT32_PER_NODE + byteOffset / BYTES_PER_NODE;
					includesLeft = nodeIndices.has( leftNodeId );
					includesRight = nodeIndices.has( rightNodeId );
					forceChildren = ! includesLeft && ! includesRight;

				}

			} else {

				includesLeft = true;
				includesRight = true;

			}

			const traverseLeft = forceChildren || includesLeft;
			const traverseRight = forceChildren || includesRight;

			let leftChange = false;
			if ( traverseLeft ) {

				leftChange = _traverse( left, byteOffset, forceChildren );

			}

			let rightChange = false;
			if ( traverseRight ) {

				rightChange = _traverse( right, byteOffset, forceChildren );

			}

			const didChange = leftChange || rightChange;
			if ( didChange ) {

				for ( let i = 0; i < 3; i ++ ) {

					const left_i = left + i;
					const right_i = right + i;
					const minLeftValue = float32Array[ left_i ];
					const maxLeftValue = float32Array[ left_i + 3 ];
					const minRightValue = float32Array[ right_i ];
					const maxRightValue = float32Array[ right_i + 3 ];

					float32Array[ nodeIndex32 + i ] = minLeftValue < minRightValue ? minLeftValue : minRightValue;
					float32Array[ nodeIndex32 + i + 3 ] = maxLeftValue > maxRightValue ? maxLeftValue : maxRightValue;

				}

			}

			return didChange;

		}

	}

	// Fix #3: helper that checks whether a triangle index falls within any of the
	// pre-computed valid ranges derived from the geometry's drawRange and groups.
	function _isTriangleValid( triIndex ) {

		for ( let r = 0, rl = validRanges.length; r < rl; r += 2 ) {

			if ( triIndex >= validRanges[ r ] && triIndex < validRanges[ r + 1 ] ) {

				return true;

			}

		}

		return false;

	}

}

export { refit_indirect };
