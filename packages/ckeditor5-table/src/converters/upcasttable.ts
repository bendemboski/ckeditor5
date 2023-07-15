/**
 * @license Copyright (c) 2003-2023, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module table/converters/upcasttable
 */

import type { Element, UpcastDispatcher, UpcastElementEvent, ViewElement, ViewNode } from 'ckeditor5/src/engine';

import { createEmptyTableCell } from '../utils/common';
import { first } from 'ckeditor5/src/utils';

/**
 * Returns a function that converts the table view representation:
 *
 * ```xml
 * <figure class="table"><table>...</table></figure>
 * ```
 *
 * to the model representation:
 *
 * ```xml
 * <table></table>
 * ```
 */
export function upcastTableFigure() {
	return ( dispatcher: UpcastDispatcher ): void => {
		dispatcher.on<UpcastElementEvent>( 'element:figure', ( evt, data, conversionApi ) => {
			// Do not convert if this is not a "table figure".
			if ( !conversionApi.consumable.test( data.viewItem, { name: true, classes: 'table' } ) ) {
				return;
			}

			// Find a table element inside the figure element.
			const viewTable = getViewTableFromFigure( data.viewItem );

			// Do not convert if table element is absent or was already converted.
			if ( !viewTable || !conversionApi.consumable.test( viewTable, { name: true } ) ) {
				return;
			}

			// Consume the figure to prevent other converters from processing it again.
			conversionApi.consumable.consume( data.viewItem, { name: true, classes: 'table' } );

			// Convert view table to model table.
			const conversionResult = conversionApi.convertItem( viewTable, data.modelCursor );

			// Get table element from conversion result.
			const modelTable = first( conversionResult.modelRange!.getItems() as Iterator<Element> );

			// When table wasn't successfully converted then finish conversion.
			if ( !modelTable ) {
				// Revert consumed figure so other features can convert it.
				conversionApi.consumable.revert( data.viewItem, { name: true, classes: 'table' } );

				return;
			}

			conversionApi.convertChildren( data.viewItem, conversionApi.writer.createPositionAt( modelTable, 'end' ) );
			conversionApi.updateConversionResult( modelTable, data );
		} );
	};
}

/**
 * View table element to model table element conversion helper.
 *
 * This conversion helper converts the table element as well as table rows.
 *
 * @returns Conversion helper.
 */
export default function upcastTable() {
	return ( dispatcher: UpcastDispatcher ): void => {
		dispatcher.on<UpcastElementEvent>( 'element:table', ( evt, data, conversionApi ) => {
			const viewTable = data.viewItem;

			// When element was already consumed then skip it.
			if ( !conversionApi.consumable.test( viewTable, { name: true } ) ) {
				return;
			}

			const { rows, headingRows, headingColumns } = scanTable( viewTable );

			// Only set attributes if values is greater then 0.
			const attributes: { headingColumns?: number; headingRows?: number } = {};

			if ( headingColumns ) {
				attributes.headingColumns = headingColumns;
			}

			if ( headingRows ) {
				attributes.headingRows = headingRows;
			}

			const table = conversionApi.writer.createElement( 'table', attributes );

			if ( !conversionApi.safeInsert( table, data.modelCursor ) ) {
				return;
			}

			conversionApi.consumable.consume( viewTable, { name: true } );

			// Upcast table rows in proper order (heading rows first).
			rows.forEach( row => conversionApi.convertItem( row, conversionApi.writer.createPositionAt( table, 'end' ) ) );

			// Convert everything else.
			conversionApi.convertChildren( viewTable, conversionApi.writer.createPositionAt( table, 'end' ) );

			// Create one row and one table cell for empty table.
			if ( table.isEmpty ) {
				const row = conversionApi.writer.createElement( 'tableRow' );
				conversionApi.writer.insert( row, conversionApi.writer.createPositionAt( table, 'end' ) );

				createEmptyTableCell( conversionApi.writer, conversionApi.writer.createPositionAt( row, 'end' ) );
			}

			conversionApi.updateConversionResult( table, data );
		} );
	};
}

/**
 * A conversion helper that skips empty <tr> elements from upcasting at the beginning of the table.
 *
 * An empty row is considered a table model error but when handling clipboard data there could be rows that contain only row-spanned cells
 * and empty TR-s are used to maintain the table structure (also {@link module:table/tablewalker~TableWalker} assumes that there are only
 * rows that have related `tableRow` elements).
 *
 * *Note:* Only the first empty rows are removed because they have no meaning and it solves the issue
 * of an improper table with all empty rows.
 *
 * @returns Conversion helper.
 */
export function skipEmptyTableRow() {
	return ( dispatcher: UpcastDispatcher ): void => {
		dispatcher.on<UpcastElementEvent>( 'element:tr', ( evt, data ) => {
			if ( data.viewItem.isEmpty && data.modelCursor.index == 0 ) {
				evt.stop();
			}
		}, { priority: 'high' } );
	};
}

/**
 * A converter that ensures an empty paragraph is inserted in a table cell if no other content was converted.
 *
 * @returns Conversion helper.
 */
export function ensureParagraphInTableCell( elementName: string ) {
	return ( dispatcher: UpcastDispatcher ): void => {
		dispatcher.on<UpcastElementEvent>( `element:${ elementName }`, ( evt, data, { writer } ) => {
			// The default converter will create a model range on converted table cell.
			if ( !data.modelRange ) {
				return;
			}

			const tableCell = data.modelRange.start.nodeAfter as Element;
			const modelCursor = writer.createPositionAt( tableCell, 0 );

			// Ensure a paragraph in the model for empty table cells for converted table cells.
			if ( data.viewItem.isEmpty ) {
				writer.insertElement( 'paragraph', modelCursor );

				return;
			}

			const childNodes = Array.from( tableCell.getChildren() );

			// In case there are only markers inside the table cell then move them to the paragraph.
			if ( childNodes.every( node => node.is( 'element', '$marker' ) ) ) {
				const paragraph = writer.createElement( 'paragraph' );

				writer.insert( paragraph, writer.createPositionAt( tableCell, 0 ) );

				for ( const node of childNodes ) {
					writer.move( writer.createRangeOn( node ), writer.createPositionAt( paragraph, 'end' ) );
				}
			}
		}, { priority: 'low' } );
	};
}

/**
 * Get view `<table>` element from the view widget (`<figure>`).
 */
function getViewTableFromFigure( figureView: ViewElement ) {
	for ( const figureChild of figureView.getChildren() ) {
		if ( figureChild.is( 'element', 'table' ) ) {
			return figureChild;
		}
	}
}

/**
 * Scans table rows and extracts required metadata from the table:
 *
 * headingRows    - The number of rows that go as table headers.
 * headingColumns - The maximum number of row headings.
 * rows           - Sorted `<tr>` elements as they should go into the model - ie. if `<thead>` is inserted after `<tbody>` in the view.
 */
function scanTable( viewTable: ViewElement ) {
	let headingRows = 0;
	let headingColumns: number | undefined = undefined;

	// The `<tbody>` and `<thead>` sections in the DOM do not have to be in order `<thead>` -> `<tbody>` and there might be more than one
	// of them.
	// As the model does not have these sections, rows from different sections must be sorted.
	// For example, below is a valid HTML table:
	//
	// <table>
	//   <tbody><tr><td>2</td></tr></tbody>
	//   <thead><tr><td>1</td></tr></thead>
	//   <tbody><tr><td>3</td></tr></tbody>
	// </table>
	//
	// But browsers will render rows in order as: 1 as the heading and 2 and 3 as the body.
	const headRows = [];
	const bodyRows = [];

	// Currently the editor does not support more then one <thead> section.
	// Only the first <thead> from the view will be used as a heading row and the others will be converted to body rows.
	let firstTheadElement;

	for ( const tableChild of Array.from( viewTable.getChildren() as IterableIterator<ViewElement> ) ) {
		// Only `<thead>`, `<tbody>` & `<tfoot>` from allowed table children can have `<tr>`s.
		// The else is for future purposes (mainly `<caption>`).
		if ( tableChild.name !== 'tbody' && tableChild.name !== 'thead' && tableChild.name !== 'tfoot' ) {
			continue;
		}

		// Save the first `<thead>` in the table as table header - all other ones will be converted to table body rows.
		if ( tableChild.name === 'thead' && !firstTheadElement ) {
			firstTheadElement = tableChild;
		}

		// There might be some extra empty text nodes between the `<tr>`s.
		// Make sure further code operates on `tr`s only. (#145)
		const trs = Array.from( tableChild.getChildren() ).filter(
			( el: ViewNode ): el is ViewElement & { name: 'tr' } => el.is( 'element', 'tr' )
		);

		for ( const tr of trs ) {
			// This <tr> is a child of a first <thead> element.
			if (
				( firstTheadElement && tableChild === firstTheadElement ) ||
				(
					tableChild.name === 'tbody' &&
					Array.from( tr.getChildren() ).length &&
					Array.from( tr.getChildren() ).every( e => e.is( 'element', 'th' ) )
				)
			) {
				headingRows++;
				headRows.push( tr );
			} else {
				bodyRows.push( tr );
			}
		}
	}

	// Generate the cell matrix so we can calculate the heading columns
	const bodyMatrix = generateCellMatrix( bodyRows );
	for ( const rowSlots of bodyMatrix ) {
		// Look for the first non-`<th>` entry (either a `<td>` or a missing cell)
		let index = 0;
		while ( index < rowSlots.length ) {
			if ( rowSlots[ index ]?.name !== 'th' ) {
				break;
			}
			index += 1;
		}
		// Update headingColumns
		if ( !headingColumns || index < headingColumns ) {
			headingColumns = index;
		}
	}

	return {
		headingRows,
		headingColumns: headingColumns || 0,
		rows: [ ...headRows, ...bodyRows ]
	};
}

/**
 * Takes an array of `<tr>` elements and generates a "matrix" (square
 * two-dimensional array) describing which `<th>`s and `<td>`s fill which
 * "slots", factoring in `rowspan`s and `colspan`s. For example, given
 *
 * ```xml
 * <table>
 *   <tr> <td>11</td> <td rowspan="2">12-22</td> <td>13</td> </tr>
 *   <tr> <td>21</td> <td>23</td> </tr>
 *   <tr> <td colspan="2">31-32</td> <td>33</rd> </tr>
 * </table>
 * ```
 *
 * The result would be (with cell elements' text content in place of the element
 * objects for readability):
 *
 * ```js
 * [
 *   [ '11', '12-22', '13' ],
 *   [ '21', '12-22', '23' ],
 *   [ '31-32', '31-32', '33' ],
 * ]
 * ```
 *
 * This allows for a computation of heading columns that factors in the case
 * where a cell from a previous rows with a `rowspan` attribute effectively adds
 * an additional header cell to a subsequent row.
 *
 * There are also cases where cells are "missing" from a row. A simple one is
 * the case where a row simply has fewer cells than another row in the same
 * table. But another is one where a row has a cell with a `rowspan` that
 * effectively adds a cell to a subsequent row "off the end" of the row. In this
 * case, there will be a `null` value instead of an element object in that
 * position. For example,
 *
 * ```xml
 * <table>
 *   <tr> <td>11</td> <td>12</td> <td rowspan="2">13-23</td> </tr>
 *   <tr> <td>21</td> </tr>
 *   <tr> <td>31</td> </tr>
 * </table>
 * ```
 *
 * would result in
 *
 * ```js
 * [
 *   [ '11', '12', '13-23' ],
 *   [ '21', null, '13-23' ],
 *   [ '31', null, null ]
 * ]
 * ```
 *
 * @param trs the array of `<tr>` elements
 * @returns the cell matrix
 */
function generateCellMatrix( trs: Array<ViewElement> ) {
	// As we iterate, we keep track of cells with rowspans >1 so later rows can
	// factor them in. This trackes any such cells from previous rows.
	let prevRowspans = new Map<number, { cell: ViewElement; remaining: number }>();

	// This is the maximum number of columns we've encountered
	let maxColumns = 0;

	const slots = trs.map( tr => {
		// This will be the slots that are in this row, including cells from
		// previous rows with a big enough "rowspan" to affect this row
		const curSlots: Array<ViewElement | null> = [];

		// Get the cell elements
		const children = Array.from( tr.getChildren() as IterableIterator<ViewElement> )
			.filter( child => child.name === 'th' || child.name === 'td' );

		// This will be any cells in this row that have a rowspan >1, so we can
		// combine it with `prevRowspans` when we're done processing this row
		const curRowspans = new Map<number, { cell: ViewElement; remaining: number }>();

		// We need to process all the cells in this row, but also previous rows'
		// cells with rowspans might add additional slots to the end of this row, so
		// we need to iterate until we've both consumed all the children _and_
		// filled out slots to the max number of columns we've encountered so far
		while ( children.length || curSlots.length < maxColumns ) {
			const rowSpan = prevRowspans.get( curSlots.length );
			if ( rowSpan && rowSpan.remaining > 0 ) {
				// We have a cell at this index in a previous row whose rowspan extends
				// it into this row, so we insert a copy of it here
				curSlots.push( rowSpan.cell );
			} else {
				// See if we have more cells in the row
				const cell = children.shift();
				if ( cell ) {
					// We do, so process it
					const colspan = parseInt( cell.getAttribute( 'colspan' ) as string || '1' );
					const rowspan = parseInt( cell.getAttribute( 'rowspan' ) as string || '1' );

					// Process this cell as many times as needed according to its colspan
					for ( let i = 0; i < colspan; i++ ) {
						// if we have a >1 rowspan, create a record in the rowSpans map for
						// this column index keeping track of it
						if ( rowspan > 1 ) {
							curRowspans.set( curSlots.length, { cell, remaining: rowspan - 1 } );
						}

						curSlots.push( cell );
					}
				} else {
					// No remaining children in this row, so no cell in this slot
					curSlots.push( null );
					continue;
				}
			}
		}

		// Now update the row spans. In weird edge cases where colspan and rowspan
		// conflict, we can end up with a cell in a column in this row that
		// "truncates" a row-spanning cell from a previous column, so make sure in
		// those cases, the value in `curRowspans` always "wins". We do this by
		// copying (and decrementing) values from `prevRowspans` into `curRowspans`
		// as long as there is no conflict, and then re-assigning `prevRowspans`.
		for ( const [ index, entry ] of prevRowspans.entries() ) {
			entry.remaining -= 1;
			if ( entry.remaining > 0 && !curRowspans.has( index ) ) {
				curRowspans.set( index, entry );
			}
		}
		prevRowspans = curRowspans;

		// Finally, update `maxColumns`
		maxColumns = Math.max( maxColumns, curSlots.length );
		return curSlots;
	} );

	// Now expand any rows that have fewer than `maxColumns` with nulls so we have
	// a proper matrix
	for ( const rowSlots of slots ) {
		while ( rowSlots.length < maxColumns ) {
			rowSlots.push( null );
		}
	}

	return slots;
}
