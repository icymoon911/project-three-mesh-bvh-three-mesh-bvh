import { getBounds } from './computeBoundsUtils.js';
import { getOptimalSplit } from './splitUtils.js';
import { BVHNode } from '../BVHNode.js';
import { BYTES_PER_NODE } from '../Constants.js';

import { partition } from './sortUtils.js';
import { countNodes, populateBuffer } from './buildUtils.js';

// Standalone splitNode function that can be independently imported and unit-tested.
// Takes a context object containing all required build parameters instead of relying
// on closure captures from buildTree.
export function splitNode( node, offset, count, context, centroidBoundingData = null, depth = 0 ) {

	const {
		maxDepth,
		verbose,
		maxLeafSize,
		strategy,
		primitiveBuffer,
		primitiveBufferStride,
		primitiveBounds,
		onProgress,
		loadRange,
		reachedMaxDepthState,
	} = context;

	if ( ! reachedMaxDepthState.value && depth >= maxDepth ) {

		reachedMaxDepthState.value = true;
		if ( verbose ) {

			console.warn( `BVH: Max depth of ${ maxDepth } reached when generating BVH. Consider increasing maxDepth.` );

		}

	}

	// early out if we've met our capacity
	if ( count <= maxLeafSize || depth >= maxDepth ) {

		if ( onProgress ) {

			onProgress( ( offset + count - loadRange.offset ) / loadRange.count );

		}

		node.offset = offset;
		node.count = count;
		return node;

	}

	// Find where to split the volume
	const split = getOptimalSplit( node.boundingData, centroidBoundingData, primitiveBounds, offset, count, strategy );
	if ( split.axis === - 1 ) {

		if ( onProgress ) {

			onProgress( ( offset + count - loadRange.offset ) / loadRange.count );

		}

		node.offset = offset;
		node.count = count;
		return node;

	}

	const splitOffset = partition( primitiveBuffer, primitiveBufferStride, primitiveBounds, offset, count, split );

	// create the two new child nodes
	if ( splitOffset === offset || splitOffset === offset + count ) {

		if ( onProgress ) {

			onProgress( ( offset + count - loadRange.offset ) / loadRange.count );

		}

		node.offset = offset;
		node.count = count;

	} else {

		node.splitAxis = split.axis;

		// create the left child and compute its bounding box
		const left = new BVHNode();
		const lstart = offset;
		const lcount = splitOffset - offset;
		node.left = left;

		getBounds( primitiveBounds, lstart, lcount, left.boundingData, context.cacheCentroidBoundingData );
		splitNode( left, lstart, lcount, context, context.cacheCentroidBoundingData, depth + 1 );

		// repeat for right
		const right = new BVHNode();
		const rstart = splitOffset;
		const rcount = count - lcount;
		node.right = right;

		getBounds( primitiveBounds, rstart, rcount, right.boundingData, context.cacheCentroidBoundingData );
		splitNode( right, rstart, rcount, context, context.cacheCentroidBoundingData, depth + 1 );

	}

	return node;

}

export function buildTree( bvh, primitiveBounds, offset, count, options, loadRange ) {

	// generate intermediate variables
	const cacheCentroidBoundingData = new Float32Array( 6 );
	const reachedMaxDepthState = { value: false };

	const context = {
		maxDepth: options.maxDepth,
		verbose: options.verbose,
		maxLeafSize: options.maxLeafSize,
		strategy: options.strategy,
		onProgress: options.onProgress,
		primitiveBuffer: bvh.primitiveBuffer,
		primitiveBufferStride: bvh.primitiveBufferStride,
		primitiveBounds,
		loadRange,
		cacheCentroidBoundingData,
		reachedMaxDepthState,
	};

	const root = new BVHNode();
	getBounds( primitiveBounds, offset, count, root.boundingData, cacheCentroidBoundingData );
	splitNode( root, offset, count, context, cacheCentroidBoundingData );
	return root;

}

export function buildPackedTree( bvh, options ) {

	const BufferConstructor = options.useSharedArrayBuffer ? SharedArrayBuffer : ArrayBuffer;

	// get the range of buffer data to construct / arrange
	const rootRanges = bvh.getRootRanges( options.range );
	const firstRange = rootRanges[ 0 ];
	const lastRange = rootRanges[ rootRanges.length - 1 ];
	const fullRange = {
		offset: firstRange.offset,
		count: lastRange.offset + lastRange.count - firstRange.offset,
	};

	// construct the primitive bounds for sorting
	const primitiveBounds = new Float32Array( 6 * fullRange.count );
	primitiveBounds.offset = fullRange.offset;
	bvh.computePrimitiveBounds( fullRange.offset, fullRange.count, primitiveBounds );

	// Build BVH roots
	bvh._roots = rootRanges.map( range => {

		const root = buildTree( bvh, primitiveBounds, range.offset, range.count, options, fullRange );
		const nodeCount = countNodes( root );
		const buffer = new BufferConstructor( BYTES_PER_NODE * nodeCount );
		populateBuffer( 0, root, buffer );
		return buffer;

	} );

}
