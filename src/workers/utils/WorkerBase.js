/** @import { BufferGeometry } from 'three' */
import { Box3, BufferAttribute } from 'three';
import { MeshBVH } from '../../core/MeshBVH.js';

export class WorkerBase {

	constructor( worker ) {

		this.name = 'WorkerBase';
		this.running = false;
		this.worker = worker;
		this.worker.onerror = e => {

			if ( e.message ) {

				throw new Error( `${ this.name }: Could not create Web Worker with error "${ e.message }"` );

			} else {

				throw new Error( `${ this.name }: Could not create Web Worker.` );

			}

		};

	}

	// Subclasses must implement this method to define what message to send to the worker
	// and which buffers to transfer. Should call worker.postMessage(...)
	postTaskMessage( /* worker, geometry, options */ ) {

		throw new Error( 'WorkerBase: postTaskMessage() not implemented' );

	}

	runTask( worker, geometry, options = {} ) {

		return new Promise( ( resolve, reject ) => {

			if (
				geometry.getAttribute( 'position' ).isInterleavedBufferAttribute ||
				geometry.index && geometry.index.isInterleavedBufferAttribute
			) {

				throw new Error( `${ this.name }: InterleavedBufferAttribute are not supported for the geometry attributes.` );

			}

			worker.onerror = e => {

				reject( new Error( `${ this.name }: ${ e.message }` ) );

			};

			worker.onmessage = e => {

				const { data } = e;

				if ( data.error ) {

					reject( new Error( data.error ) );
					worker.onmessage = null;

				} else if ( data.serialized ) {

					const { serialized, position } = data;
					const bvh = MeshBVH.deserialize( serialized, geometry, { setIndex: false } );
					const boundsOptions = {
						setBoundingBox: true,
						...options,
					};

					// we need to replace the arrays because they're neutered entirely by the
					// webworker transfer.
					geometry.attributes.position.array = position;
					if ( serialized.index ) {

						if ( geometry.index ) {

							geometry.index.array = serialized.index;

						} else {

							const newIndex = new BufferAttribute( serialized.index, 1, false );
							geometry.setIndex( newIndex );

						}

					}

					if ( boundsOptions.setBoundingBox ) {

						geometry.boundingBox = bvh.getBoundingBox( new Box3() );

					}

					if ( options.onProgress ) {

						options.onProgress( data.progress );

					}

					resolve( bvh );
					worker.onmessage = null;

				} else if ( options.onProgress ) {

					options.onProgress( data.progress );

				}

			};

			this.postTaskMessage( worker, geometry, options );

		} );

	}

	generate( ...args ) {

		if ( this.running ) {

			throw new Error( `${ this.name }: Already running job.` );

		}

		if ( this.worker === null ) {

			throw new Error( `${ this.name }: Worker has been disposed.` );

		}

		this.running = true;

		const promise = this.runTask( this.worker, ...args );
		promise.finally( () => {

			this.running = false;

		} );

		return promise;

	}

	dispose() {

		this.worker.terminate();
		this.worker = null;

	}

}
