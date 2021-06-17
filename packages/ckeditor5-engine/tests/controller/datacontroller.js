/**
 * @license Copyright (c) 2003-2021, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

import Model from '../../src/model/model';
import ModelRange from '../../src/model/range';
import ViewRange from '../../src/view/range';
import DataController from '../../src/controller/datacontroller';
import HtmlDataProcessor from '../../src/dataprocessor/htmldataprocessor';

import ModelDocumentFragment from '../../src/model/documentfragment';
import ViewDocumentFragment from '../../src/view/documentfragment';
import ViewDocument from '../../src/view/document';

import { getData, setData, stringify, parse as parseModel } from '../../src/dev-utils/model';
import { parse as parseView, stringify as stringifyView } from '../../src/dev-utils/view';

import count from '@ckeditor/ckeditor5-utils/src/count';

import UpcastHelpers from '../../src/conversion/upcasthelpers';
import DowncastHelpers from '../../src/conversion/downcasthelpers';
import { expectToThrowCKEditorError } from '@ckeditor/ckeditor5-utils/tests/_utils/utils';
import { StylesProcessor } from '../../src/view/stylesmap';

describe( 'DataController', () => {
	let model, modelDocument, data, schema, upcastHelpers, downcastHelpers, viewDocument;

	beforeEach( () => {
		const stylesProcessor = new StylesProcessor();
		model = new Model();

		schema = model.schema;
		modelDocument = model.document;

		modelDocument.createRoot();
		modelDocument.createRoot( '$title', 'title' );

		schema.register( '$title', { inheritAllFrom: '$root' } );

		viewDocument = new ViewDocument( stylesProcessor );
		data = new DataController( model, stylesProcessor );
		upcastHelpers = new UpcastHelpers( [ data.upcastDispatcher ] );
		downcastHelpers = new DowncastHelpers( [ data.downcastDispatcher ] );
	} );

	describe( 'constructor()', () => {
		it( 'sets the model and styles processor properties', () => {
			const stylesProcessor = new StylesProcessor();
			const data = new DataController( model, stylesProcessor );

			expect( data.model ).to.equal( model );
			expect( data.stylesProcessor ).to.equal( stylesProcessor );
		} );

		it( 'should create the #viewDocument property', () => {
			const stylesProcessor = new StylesProcessor();
			const data = new DataController( model, stylesProcessor );

			expect( data.viewDocument ).to.be.instanceOf( ViewDocument );
		} );

		it( 'should create #htmlProcessor property', () => {
			const stylesProcessor = new StylesProcessor();
			const data = new DataController( model, stylesProcessor );

			expect( data.htmlProcessor ).to.be.instanceOf( HtmlDataProcessor );
		} );

		it( 'should assign #htmlProcessor property to the #processor property', () => {
			const stylesProcessor = new StylesProcessor();
			const data = new DataController( model, stylesProcessor );

			expect( data.htmlProcessor ).to.equal( data.processor );
		} );
	} );

	describe( 'parse()', () => {
		it( 'should set text', () => {
			schema.extend( '$text', { allowIn: '$root' } );
			const output = data.parse( '<p>foo<b>bar</b></p>' );

			expect( output ).to.instanceof( ModelDocumentFragment );
			expect( stringify( output ) ).to.equal( 'foobar' );
		} );

		it( 'should set paragraph', () => {
			schema.register( 'paragraph', { inheritAllFrom: '$block' } );

			upcastHelpers.elementToElement( { view: 'p', model: 'paragraph' } );

			const output = data.parse( '<p>foo<b>bar</b></p>' );

			expect( output ).to.instanceof( ModelDocumentFragment );
			expect( stringify( output ) ).to.equal( '<paragraph>foobar</paragraph>' );
		} );

		it( 'should set two paragraphs', () => {
			schema.register( 'paragraph', { inheritAllFrom: '$block' } );

			upcastHelpers.elementToElement( { view: 'p', model: 'paragraph' } );

			const output = data.parse( '<p>foo</p><p>bar</p>' );

			expect( output ).to.instanceof( ModelDocumentFragment );
			expect( stringify( output ) ).to.equal( '<paragraph>foo</paragraph><paragraph>bar</paragraph>' );
		} );

		it( 'should set paragraphs with bold', () => {
			schema.register( 'paragraph', { inheritAllFrom: '$block' } );
			schema.extend( '$text', {
				allowAttributes: [ 'bold' ]
			} );

			upcastHelpers.elementToElement( { view: 'p', model: 'paragraph' } );
			upcastHelpers.elementToAttribute( { view: 'strong', model: 'bold' } );

			const output = data.parse( '<p>foo<strong>bar</strong></p>' );

			expect( output ).to.instanceof( ModelDocumentFragment );
			expect( stringify( output ) ).to.equal( '<paragraph>foo<$text bold="true">bar</$text></paragraph>' );
		} );

		it( 'should parse in the root context by default', () => {
			const output = data.parse( 'foo' );

			expect( stringify( output ) ).to.equal( '' );
		} );

		it( 'should accept parsing context', () => {
			const output = data.parse( 'foo', [ '$block' ] );

			expect( stringify( output ) ).to.equal( 'foo' );
		} );
	} );

	describe( 'toModel()', () => {
		beforeEach( () => {
			schema.register( 'paragraph', { inheritAllFrom: '$block' } );

			upcastHelpers.elementToElement( { view: 'p', model: 'paragraph' } );
		} );

		it( 'should convert content of an element #1', () => {
			const viewElement = parseView( '<p>foo</p>' );
			const output = data.toModel( viewElement );

			expect( output ).to.instanceof( ModelDocumentFragment );
			expect( stringify( output ) ).to.equal( '<paragraph>foo</paragraph>' );
		} );

		it( 'should convert content of an element #2', () => {
			const viewFragment = parseView( '<p>foo</p><p>bar</p>' );
			const output = data.toModel( viewFragment );

			expect( output ).to.be.instanceOf( ModelDocumentFragment );
			expect( stringify( output ) ).to.equal( '<paragraph>foo</paragraph><paragraph>bar</paragraph>' );
		} );

		it( 'should accept parsing context', () => {
			modelDocument.createRoot( 'inlineRoot', 'inlineRoot' );

			schema.register( 'inlineRoot', { allowChildren: '$text' } );

			const viewFragment = new ViewDocumentFragment( viewDocument, [ parseView( 'foo' ) ] );

			// Model fragment in root (note that it is auto-paragraphed because $text is not allowed directly in $root).
			expect( stringify( data.toModel( viewFragment ) ) ).to.equal( '<paragraph>foo</paragraph>' );

			// Model fragment in inline root.
			expect( stringify( data.toModel( viewFragment, [ 'inlineRoot' ] ) ) ).to.equal( 'foo' );
		} );
	} );

	describe( 'init()', () => {
		it( 'should be decorated', () => {
			const spy = sinon.spy();

			data.on( 'init', spy );

			data.init( 'foo bar' );

			sinon.assert.calledWithExactly( spy, sinon.match.any, [ 'foo bar' ] );
		} );

		it( 'should fire ready event after init', () => {
			const spy = sinon.spy();

			data.on( 'ready', spy );

			data.init( 'foo bar' );

			sinon.assert.called( spy );
		} );

		it( 'should throw an error when document data is already initialized', () => {
			data.init( '<p>Foo</p>' );

			expectToThrowCKEditorError( () => {
				data.init( '<p>Bar</p>' );
			}, /datacontroller-init-document-not-empty/, model );
		} );

		it( 'should set data to default main root', () => {
			schema.extend( '$text', { allowIn: '$root' } );
			data.init( 'foo' );

			expect( getData( model, { withoutSelection: true } ) ).to.equal( 'foo' );
		} );

		it( 'should set data to multiple roots at once', () => {
			schema.extend( '$text', { allowIn: '$root' } );
			data.init( { main: 'bar', title: 'baz' } );

			expect( getData( model, { withoutSelection: true } ) ).to.equal( 'bar' );
			expect( getData( model, { withoutSelection: true, rootName: 'title' } ) ).to.equal( 'baz' );
		} );

		it( 'should get root name as a parameter', () => {
			schema.extend( '$text', { allowIn: '$root' } );
			data.init( { title: 'foo' } );

			expect( getData( model, { withoutSelection: true, rootName: 'title' } ) ).to.equal( 'foo' );
		} );

		it( 'should create a batch', () => {
			schema.extend( '$text', { allowIn: '$root' } );
			data.init( 'foo' );

			expect( count( modelDocument.history.getOperations() ) ).to.equal( 1 );
		} );

		it( 'should cause firing change event', () => {
			const spy = sinon.spy();

			schema.extend( '$text', { allowIn: '$root' } );
			model.document.on( 'change', spy );

			data.init( 'foo' );

			expect( spy.calledOnce ).to.be.true;
		} );

		it( 'should return a resolved Promise', () => {
			const promise = data.init( '<p>Foo</p>' );

			expect( promise ).to.be.instanceof( Promise );

			return promise;
		} );

		it( 'should throw an error when non-existent root is used (single)', () => {
			expectToThrowCKEditorError( () => {
				data.init( { nonexistent: '<p>Bar</p>' } );
			}, 'datacontroller-init-non-existent-root' );
		} );

		it( 'should throw an error when non-existent root is used (one of many)', () => {
			schema.extend( '$text', { allowIn: '$root' } );

			expectToThrowCKEditorError( () => {
				data.init( { main: 'bar', nonexistent: '<p>Bar</p>' } );
			}, /^datacontroller-init-non-existent-root/, model );

			expect( getData( model, { withoutSelection: true } ) ).to.equal( '' );
		} );
	} );

	describe( 'set()', () => {
		it( 'should be decorated', () => {
			const spy = sinon.spy();

			data.on( 'set', spy );

			data.set( 'foo bar' );

			sinon.assert.calledWithExactly( spy, sinon.match.any, [ 'foo bar' ] );
		} );

		it( 'should set data to default main root', () => {
			schema.extend( '$text', { allowIn: '$root' } );
			data.set( 'foo' );

			expect( getData( model, { withoutSelection: true } ) ).to.equal( 'foo' );
		} );

		it( 'should create a batch', () => {
			schema.extend( '$text', { allowIn: '$root' } );
			data.set( 'foo' );

			expect( modelDocument.history.getOperations().length ).to.equal( 1 );
		} );

		it( 'should create a `default` batch by default', () => {
			schema.extend( '$text', { allowIn: '$root' } );
			data.set( 'foo' );

			const operation = modelDocument.history.getOperations()[ 0 ];

			expect( operation.batch.type ).to.equal( 'default' );
		} );

		it( 'should create a batch specified by the `options.batch` option when provided', () => {
			schema.extend( '$text', { allowIn: '$root' } );
			data.set( 'foo', { batchType: 'transparent' } );

			const operation = modelDocument.history.getOperations()[ 0 ];

			expect( operation.batch.type ).to.equal( 'transparent' );
		} );

		it( 'should cause firing change event', () => {
			const spy = sinon.spy();

			schema.extend( '$text', { allowIn: '$root' } );
			model.document.on( 'change', spy );

			data.set( 'foo' );

			expect( spy.calledOnce ).to.be.true;
		} );

		it( 'should get root name as a parameter', () => {
			schema.extend( '$text', { allowIn: '$root' } );
			data.set( 'foo' );
			data.set( { title: 'Bar' } );

			expect( getData( model, { withoutSelection: true, rootName: 'main' } ) ).to.equal( 'foo' );
			expect( getData( model, { withoutSelection: true, rootName: 'title' } ) ).to.equal( 'Bar' );

			expect( count( modelDocument.history.getOperations() ) ).to.equal( 2 );
		} );

		it( 'should parse given data before set in a context of correct root', () => {
			schema.extend( '$text', { allowIn: '$title', disallowIn: '$root' } );
			data.set( 'foo', 'main' );
			data.set( { title: 'Bar' } );

			expect( getData( model, { withoutSelection: true, rootName: 'main' } ) ).to.equal( '' );
			expect( getData( model, { withoutSelection: true, rootName: 'title' } ) ).to.equal( 'Bar' );

			expect( count( modelDocument.history.getOperations() ) ).to.equal( 2 );
		} );

		// This case was added when order of params was different and it really didn't work. Let's keep it
		// if anyone will ever try to change this.
		it( 'should allow setting empty data', () => {
			schema.extend( '$text', { allowIn: '$root' } );

			data.set( { title: 'foo' } );

			expect( getData( model, { withoutSelection: true, rootName: 'title' } ) ).to.equal( 'foo' );

			data.set( { title: '' } );

			expect( getData( model, { withoutSelection: true, rootName: 'title' } ) ).to.equal( '' );
		} );

		it( 'should throw an error when non-existent root is used (single)', () => {
			expectToThrowCKEditorError( () => {
				data.set( { nonexistent: '<p>Bar</p>' } );
			}, /datacontroller-set-non-existent-root/, model );
		} );

		it( 'should throw an error when non-existent root is used (one of many) without touching any roots data', () => {
			schema.extend( '$text', { allowIn: '$root' } );
			data.set( 'foo' );

			expectToThrowCKEditorError( () => {
				data.set( { main: 'bar', nonexistent: '<p>Bar</p>' } );
			}, /datacontroller-set-non-existent-root/, model );

			expect( getData( model, { withoutSelection: true } ) ).to.equal( 'foo' );
		} );

		// https://github.com/ckeditor/ckeditor5-engine/issues/1721.
		it( 'should not throw when setting the data with markers that already exist in the editor', () => {
			schema.extend( '$text', { allowIn: '$root' } );

			data.set( 'foo' );

			downcastHelpers.markerToData( { model: 'marker' } );
			upcastHelpers.dataToMarker( { view: 'marker' } );

			model.change( writer => {
				writer.addMarker( 'marker', { range: writer.createRangeIn( modelDocument.getRoot() ), usingOperation: true } );
			} );

			expect( () => {
				data.set( data.get() );
			} ).not.to.throw();
		} );
	} );

	describe( 'get()', () => {
		beforeEach( () => {
			schema.register( 'paragraph', { inheritAllFrom: '$block' } );
			downcastHelpers.elementToElement( { model: 'paragraph', view: 'p' } );
		} );

		it( 'should get paragraph with text', () => {
			setData( model, '<paragraph>foo</paragraph>' );

			expect( data.get() ).to.equal( '<p>foo</p>' );
			expect( data.get( { trim: 'empty' } ) ).to.equal( '<p>foo</p>' );
		} );

		it( 'should trim empty paragraph by default', () => {
			setData( model, '<paragraph></paragraph>' );

			expect( data.get() ).to.equal( '' );
			expect( data.get( { trim: 'empty' } ) ).to.equal( '' );
		} );

		it( 'should get empty paragraph (with trim=none)', () => {
			setData( model, '<paragraph></paragraph>' );

			expect( data.get( { trim: 'none' } ) ).to.equal( '<p>&nbsp;</p>' );
		} );

		it( 'should get two paragraphs', () => {
			setData( model, '<paragraph>foo</paragraph><paragraph>bar</paragraph>' );

			expect( data.get() ).to.equal( '<p>foo</p><p>bar</p>' );
			expect( data.get( { trim: 'empty' } ) ).to.equal( '<p>foo</p><p>bar</p>' );
		} );

		it( 'should get text directly in root', () => {
			schema.extend( '$text', { allowIn: '$root' } );
			setData( model, 'foo' );

			expect( data.get() ).to.equal( 'foo' );
			expect( data.get( { trim: 'empty' } ) ).to.equal( 'foo' );
		} );

		it( 'should get paragraphs without bold', () => {
			setData( model, '<paragraph>foo<$text bold="true">bar</$text></paragraph>' );

			expect( data.get() ).to.equal( '<p>foobar</p>' );
			expect( data.get( { trim: 'empty' } ) ).to.equal( '<p>foobar</p>' );
		} );

		it( 'should get paragraphs with bold', () => {
			setData( model, '<paragraph>foo<$text bold="true">bar</$text></paragraph>' );

			downcastHelpers.attributeToElement( { model: 'bold', view: 'strong' } );

			expect( data.get() ).to.equal( '<p>foo<strong>bar</strong></p>' );
			expect( data.get( { trim: 'empty' } ) ).to.equal( '<p>foo<strong>bar</strong></p>' );
		} );

		it( 'should get root name as a parameter', () => {
			schema.extend( '$text', { allowIn: '$root' } );

			setData( model, '<paragraph>foo</paragraph>', { rootName: 'main' } );
			setData( model, 'Bar', { rootName: 'title' } );

			downcastHelpers.attributeToElement( { model: 'bold', view: 'strong' } );

			expect( data.get() ).to.equal( '<p>foo</p>' );
			expect( data.get( { rootName: 'main' } ) ).to.equal( '<p>foo</p>' );
			expect( data.get( { rootName: 'title' } ) ).to.equal( 'Bar' );
		} );

		it( 'should throw an error when non-existent root is used', () => {
			expectToThrowCKEditorError( () => {
				data.get( { rootName: 'nonexistent' } );
			}, 'datacontroller-get-non-existent-root' );
		} );

		it( 'should allow to provide additional options for retrieving data - insert conversion', () => {
			data.downcastDispatcher.on( 'insert:paragraph', ( evt, data, conversionApi ) => {
				conversionApi.consumable.consume( data.item, 'insert' );

				const viewPosition = conversionApi.mapper.toViewPosition( data.range.start );
				const viewElement = conversionApi.writer.createContainerElement( 'p', {
					attribute: conversionApi.options.attributeValue
				} );

				conversionApi.mapper.bindElements( data.item, viewElement );
				conversionApi.writer.insert( viewPosition, viewElement );
			}, { priority: 'high' } );

			setData( model, '<paragraph>foo</paragraph>' );

			expect( data.get( { attributeValue: 'foo' } ) ).to.equal( '<p attribute="foo">foo</p>' );
			expect( data.get( { attributeValue: 'bar' } ) ).to.equal( '<p attribute="bar">foo</p>' );
		} );

		it( 'should allow to provide additional options for retrieving data - attribute conversion', () => {
			schema.extend( 'paragraph', { allowAttributes: [ 'foo' ] } );
			downcastHelpers.elementToElement( { model: 'paragraph', view: 'p' } );

			data.downcastDispatcher.on( 'attribute:foo', ( evt, data, conversionApi ) => {
				if ( data.attributeNewValue === conversionApi.options.skipAttribute ) {
					return;
				}

				const viewRange = conversionApi.mapper.toViewRange( data.range );
				const viewElement = conversionApi.writer.createAttributeElement( data.attributeNewValue );

				conversionApi.writer.wrap( viewRange, viewElement );
			} );

			setData( model, '<paragraph>f<$text foo="a">o</$text>ob<$text foo="b">a</$text>r</paragraph>' );

			expect( data.get() ).to.equal( '<p>f<a>o</a>ob<b>a</b>r</p>' );
			expect( data.get( { skipAttribute: 'a' } ) ).to.equal( '<p>foob<b>a</b>r</p>' );
			expect( data.get( { skipAttribute: 'b' } ) ).to.equal( '<p>f<a>o</a>obar</p>' );
		} );

		it( 'should allow to provide additional options for retrieving data - addMarker conversion', () => {
			data.downcastDispatcher.on( 'addMarker', ( evt, data, conversionApi ) => {
				if ( conversionApi.options.skipMarker ) {
					return;
				}

				const viewElement = conversionApi.writer.createAttributeElement( 'marker' );
				const viewRange = conversionApi.mapper.toViewRange( data.markerRange );

				conversionApi.writer.wrap( viewRange, viewElement );
			} );

			setData( model, '<paragraph>foo</paragraph>' );

			const root = model.document.getRoot();

			model.change( writer => {
				const start = writer.createPositionFromPath( root, [ 0, 1 ] );
				const end = writer.createPositionFromPath( root, [ 0, 2 ] );

				writer.addMarker( 'marker', {
					range: writer.createRange( start, end ),
					usingOperation: false
				} );
			} );

			expect( data.get( { skipMarker: false } ) ).to.equal( '<p>f<marker>o</marker>o</p>' );
			expect( data.get( { skipMarker: true } ) ).to.equal( '<p>foo</p>' );
		} );

		it( 'should pass default options value to converters', () => {
			data.downcastDispatcher.on( 'insert:paragraph', ( evt, data, conversionApi ) => {
				expect( conversionApi.options ).to.deep.equal( {} );
			} );

			setData( model, '<paragraph>foo</paragraph>' );
			data.get();
		} );
	} );

	describe( 'stringify()', () => {
		beforeEach( () => {
			schema.register( 'paragraph', { inheritAllFrom: '$block' } );
			schema.register( 'div' );

			schema.extend( '$block', { allowIn: 'div' } );
			schema.extend( 'div', { allowIn: '$root' } );

			downcastHelpers.elementToElement( { model: 'paragraph', view: 'p' } );
		} );

		it( 'should stringify a content of an element', () => {
			const modelElement = parseModel( '<div><paragraph>foo</paragraph></div>', schema );

			expect( data.stringify( modelElement ) ).to.equal( '<p>foo</p>' );
		} );

		it( 'should stringify a content of a document fragment', () => {
			const modelDocumentFragment = parseModel( '<paragraph>foo</paragraph><paragraph>bar</paragraph>', schema );

			expect( data.stringify( modelDocumentFragment ) ).to.equal( '<p>foo</p><p>bar</p>' );
		} );

		it( 'should allow to provide additional options to the conversion process', () => {
			const spy = sinon.spy();

			data.downcastDispatcher.on( 'insert:paragraph', ( evt, data, conversionApi ) => {
				spy( conversionApi.options );
			}, { priority: 'high' } );

			const modelDocumentFragment = parseModel( '<paragraph>foo</paragraph><paragraph>bar</paragraph>', schema );
			const options = { foo: 'bar' };

			data.stringify( modelDocumentFragment, options );
			expect( spy.lastCall.args[ 0 ] ).to.equal( options );
		} );

		it( 'should pass default options value to converters', () => {
			data.downcastDispatcher.on( 'insert:paragraph', ( evt, data, conversionApi ) => {
				expect( conversionApi.options ).to.deep.equal( {} );
			} );

			const modelDocumentFragment = parseModel( '<paragraph>foo</paragraph><paragraph>bar</paragraph>', schema );
			data.stringify( modelDocumentFragment );
		} );
	} );

	describe( 'toView()', () => {
		beforeEach( () => {
			schema.register( 'paragraph', { inheritAllFrom: '$block' } );
			schema.register( 'div' );

			schema.extend( '$block', { allowIn: 'div' } );
			schema.extend( 'div', { allowIn: '$root' } );

			downcastHelpers.elementToElement( { model: 'paragraph', view: 'p' } );
		} );

		it( 'should use #viewDocument as a parent for returned document fragments', () => {
			const modelElement = parseModel( '<div><paragraph>foo</paragraph></div>', schema );
			const viewDocumentFragment = data.toView( modelElement );

			expect( viewDocumentFragment.document ).to.equal( data.viewDocument );
		} );

		it( 'should convert a content of an element', () => {
			const modelElement = parseModel( '<div><paragraph>foo</paragraph></div>', schema );

			const viewDocumentFragment = data.toView( modelElement );

			expect( viewDocumentFragment ).to.be.instanceOf( ViewDocumentFragment );

			const viewElement = viewDocumentFragment.getChild( 0 );

			expect( viewElement.name ).to.equal( 'p' );
			expect( viewElement.childCount ).to.equal( 1 );
			expect( viewElement.getChild( 0 ).data ).to.equal( 'foo' );
		} );

		it( 'should correctly convert document markers #1', () => {
			const modelElement = parseModel( '<div><paragraph>foobar</paragraph></div>', schema );
			const modelRoot = model.document.getRoot();

			downcastHelpers.markerToHighlight( { model: 'marker:a', view: { classes: 'a' } } );

			model.change( writer => {
				writer.insert( modelElement, modelRoot, 0 );
				const range = writer.createRange( writer.createPositionAt( modelRoot, 0 ), writer.createPositionAt( modelRoot, 1 ) );
				writer.addMarker( 'marker:a', { range, usingOperation: true } );
			} );

			const viewDocumentFragment = data.toView( modelElement );
			const viewElement = viewDocumentFragment.getChild( 0 );

			expect( stringifyView( viewElement ) ).to.equal( '<p><span class="a">foobar</span></p>' );
		} );

		it( 'should correctly convert document markers #2', () => {
			const modelElement = parseModel( '<div><paragraph>foo</paragraph><paragraph>bar</paragraph></div>', schema );
			const modelRoot = model.document.getRoot();

			downcastHelpers.markerToHighlight( { model: 'marker:a', view: { classes: 'a' } } );
			downcastHelpers.markerToHighlight( { model: 'marker:b', view: { classes: 'b' } } );

			const modelP1 = modelElement.getChild( 0 );
			const modelP2 = modelElement.getChild( 1 );

			model.change( writer => {
				writer.insert( modelElement, modelRoot, 0 );

				const rangeA = writer.createRange( writer.createPositionAt( modelP1, 1 ), writer.createPositionAt( modelP1, 3 ) );
				const rangeB = writer.createRange( writer.createPositionAt( modelP2, 0 ), writer.createPositionAt( modelP2, 2 ) );

				writer.addMarker( 'marker:a', { range: rangeA, usingOperation: true } );
				writer.addMarker( 'marker:b', { range: rangeB, usingOperation: true } );
			} );

			const viewDocumentFragment = data.toView( modelP1 );

			expect( stringifyView( viewDocumentFragment ) ).to.equal( 'f<span class="a">oo</span>' );
		} );

		// See https://github.com/ckeditor/ckeditor5/issues/8485.
		it( 'should fire an addMarker event for collapsed markers located at $root element boundary', () => {
			const root = model.document.getRoot();
			const spy = sinon.spy();

			data.downcastDispatcher.on( 'addMarker:fooMarkerAtElementStart', spy );
			data.downcastDispatcher.on( 'addMarker:fooMarkerAtElementEnd', spy );

			setData( model, '<paragraph>foobar</paragraph>' );

			model.change( writer => {
				writer.addMarker( 'fooMarkerAtElementStart', {
					range: writer.createRange(
						writer.createPositionFromPath( root, [ 0 ] ),
						writer.createPositionFromPath( root, [ 0 ] )
					),
					usingOperation: true
				} );

				writer.addMarker( 'fooMarkerAtElementEnd', {
					range: writer.createRange(
						writer.createPositionFromPath( root, [ 1 ] ),
						writer.createPositionFromPath( root, [ 1 ] )
					),
					usingOperation: true
				} );
			} );

			data.toView( root );

			sinon.assert.calledTwice( spy );
			expect( spy.firstCall.args[ 1 ].markerName ).to.equal( 'fooMarkerAtElementStart' );
			expect( spy.secondCall.args[ 1 ].markerName ).to.equal( 'fooMarkerAtElementEnd' );
		} );

		// See https://github.com/ckeditor/ckeditor5/issues/8485.
		it( 'should fire an addMarker event for collapsed markers located at non-$root element boundary', () => {
			const root = model.document.getRoot();
			const spy = sinon.spy();

			data.downcastDispatcher.on( 'addMarker:fooMarkerAtElementStart', spy );
			data.downcastDispatcher.on( 'addMarker:fooMarkerAtElementEnd', spy );

			setData( model, '<div><paragraph>foobar</paragraph></div>' );

			const modelParagraph = root.getChild( 0 );

			model.change( writer => {
				writer.addMarker( 'fooMarkerAtElementStart', {
					range: writer.createRange(
						writer.createPositionFromPath( modelParagraph, [ 0 ] ),
						writer.createPositionFromPath( modelParagraph, [ 0 ] )
					),
					usingOperation: true
				} );

				writer.addMarker( 'fooMarkerAtElementEnd', {
					range: writer.createRange(
						writer.createPositionFromPath( modelParagraph, [ 1 ] ),
						writer.createPositionFromPath( modelParagraph, [ 1 ] )
					),
					usingOperation: true
				} );
			} );

			data.toView( modelParagraph );

			sinon.assert.calledTwice( spy );
			expect( spy.firstCall.args[ 1 ].markerName ).to.equal( 'fooMarkerAtElementStart' );
			expect( spy.secondCall.args[ 1 ].markerName ).to.equal( 'fooMarkerAtElementEnd' );
		} );

		it( 'should convert a document fragment and its markers', () => {
			downcastHelpers.markerToData( { model: 'foo' } );
			const modelDocumentFragment = parseModel( '<paragraph>foo</paragraph><paragraph>bar</paragraph>', schema );

			const range = model.createRange(
				model.createPositionAt( modelDocumentFragment.getChild( 0 ), 1 ),
				model.createPositionAt( modelDocumentFragment.getChild( 1 ), 2 )
			);
			modelDocumentFragment.markers.set( 'foo:bar', range );

			const viewDocumentFragment = data.toView( modelDocumentFragment );

			expect( viewDocumentFragment ).to.be.instanceOf( ViewDocumentFragment );
			expect( viewDocumentFragment ).to.have.property( 'childCount', 2 );

			expect( stringifyView( viewDocumentFragment ) ).to.equal(
				'<p>f<foo-start name="bar"></foo-start>oo</p><p>ba<foo-end name="bar"></foo-end>r</p>'
			);
		} );

		it( 'should keep view-model mapping', () => {
			const modelDocumentFragment = parseModel( '<paragraph>foo</paragraph><paragraph>bar</paragraph>', schema );
			const viewDocumentFragment = data.toView( modelDocumentFragment );

			const firstModelElement = modelDocumentFragment.getChild( 0 );
			const firstViewElement = viewDocumentFragment.getChild( 0 );

			const modelRange = ModelRange._createOn( firstModelElement );
			const viewRange = ViewRange._createOn( firstViewElement );

			const mappedModelRange = data.mapper.toModelRange( viewRange );
			const mappedViewRange = data.mapper.toViewRange( modelRange );

			expect( mappedModelRange ).to.be.instanceOf( ModelRange );
			expect( mappedViewRange ).to.be.instanceOf( ViewRange );

			expect( mappedModelRange.end.nodeBefore ).to.equal( firstModelElement );
			expect( mappedModelRange.end.nodeAfter ).to.equal( modelDocumentFragment.getChild( 1 ) );
			expect( mappedViewRange.end.nodeBefore ).to.equal( firstViewElement );
			expect( mappedViewRange.end.nodeAfter ).to.equal( viewDocumentFragment.getChild( 1 ) );
		} );

		it( 'should allow to provide additional options to the conversion process', () => {
			const root = model.document.getRoot();
			const spy = sinon.spy();

			data.downcastDispatcher.on( 'insert:paragraph', ( evt, data, conversionApi ) => {
				spy( conversionApi.options );
			}, { priority: 'high' } );

			data.downcastDispatcher.on( 'addMarker:marker', ( evt, data, conversionApi ) => {
				spy( conversionApi.options );
			}, { priority: 'high' } );

			setData( model, '<paragraph>foo</paragraph>' );

			model.change( writer => {
				writer.addMarker( 'marker', {
					range: model.createRange( model.createPositionFromPath( root, [ 0, 1 ] ) ),
					usingOperation: false
				} );
			} );

			const options = { foo: 'bar' };

			data.toView( root, options );

			sinon.assert.calledTwice( spy );
			expect( spy.firstCall.args[ 0 ] ).to.equal( options );
			expect( spy.lastCall.args[ 0 ] ).to.equal( options );
		} );

		it( 'should pass default options value to converters', () => {
			data.downcastDispatcher.on( 'insert:paragraph', ( evt, data, conversionApi ) => {
				expect( conversionApi.options ).to.deep.equal( {} );
			} );

			const root = model.document.getRoot();
			setData( model, '<paragraph>foo</paragraph>' );

			data.toView( root );
		} );
	} );

	describe( 'destroy()', () => {
		it( 'should be there for you', () => {
			// Should not throw.
			data.destroy();

			expect( data ).to.respondTo( 'destroy' );
		} );
	} );

	describe( 'addStyleProcessorRules()', () => {
		it( 'should execute callback with an instance of StyleProcessor as the first argument', () => {
			const stylesProcessor = new StylesProcessor();
			const data = new DataController( model, stylesProcessor );

			const spy = sinon.spy();

			data.addStyleProcessorRules( spy );

			sinon.assert.calledOnce( spy );
			sinon.assert.calledWithExactly( spy, stylesProcessor );
		} );
	} );

	describe( 'registerRawContentMatcher()', () => {
		it( 'should not register matcher twice for one instance of data processor', () => {
			const stylesProcessor = new StylesProcessor();
			const data = new DataController( model, stylesProcessor );

			const spy = sinon.spy();

			data.processor.registerRawContentMatcher = spy;

			data.registerRawContentMatcher( 'div' );

			sinon.assert.calledOnce( spy );
			sinon.assert.calledWithExactly( spy, 'div' );
		} );

		it( 'should register matcher on both of data processor instances', () => {
			const stylesProcessor = new StylesProcessor();
			const data = new DataController( model, stylesProcessor );
			data.processor = new HtmlDataProcessor( viewDocument );

			const spyProcessor = sinon.spy();
			const spyHtmlProcessor = sinon.spy();

			data.processor.registerRawContentMatcher = spyProcessor;
			data.htmlProcessor.registerRawContentMatcher = spyHtmlProcessor;

			data.registerRawContentMatcher( 'div' );

			sinon.assert.calledOnce( spyProcessor );
			sinon.assert.calledWithExactly( spyProcessor, 'div' );
			sinon.assert.calledOnce( spyHtmlProcessor );
			sinon.assert.calledWithExactly( spyHtmlProcessor, 'div' );
		} );
	} );
} );
