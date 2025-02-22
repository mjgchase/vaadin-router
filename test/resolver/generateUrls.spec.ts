/**
 * Universal Router (https://www.kriasoft.com/universal-router/)
 *
 * Copyright (c) 2015-present Kriasoft.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.txt file in the root directory of this source tree.
 */
import { expect, use } from '@esm-bundle/chai';
import chaiAsPromised from 'chai-as-promised';
import chaiDom from 'chai-dom';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import generateUrls, { type StringifyQueryParams } from '../../src/resolver/generateUrls.js';
import Resolver from '../../src/resolver/resolver.js';
import '../setup.js';
import type { Route } from '../../src/resolver/types.t.js';

use(chaiDom);
use(sinonChai);
use(chaiAsPromised);

describe('generateUrls(router, options)(routeName, params)', () => {
  const action = sinon.stub();

  it('should throw an error in case of invalid router', () => {
    // @ts-expect-error: error-throwing test
    expect(() => generateUrls()).to.throw(TypeError, /An instance of Resolver is expected/u);
    // @ts-expect-error: error-throwing test
    expect(() => generateUrls([])).to.throw(TypeError, /An instance of Resolver is expected/u);
    // @ts-expect-error: error-throwing test
    expect(() => generateUrls(123)).to.throw(TypeError, /An instance of Resolver is expected/u);
    // @ts-expect-error: error-throwing test
    expect(() => generateUrls(null)).to.throw(TypeError, /An instance of Resolver is expected/u);
    // @ts-expect-error: error-throwing test
    expect(() => generateUrls(Resolver)).to.throw(TypeError, /An instance of Resolver is expected/u);
  });

  it('should throw an error if no route found', () => {
    const router = new Resolver({ action, name: 'a', path: '/a' });
    const url = generateUrls(router);
    expect(() => url('hello')).to.throw(Error, /Route "hello" not found/u);

    router.root.__children = [{ action, name: 'new', path: '/b' }];
    expect(url('new')).to.be.equal('/a/b');
  });

  it('should throw an error if route name is not unique', () => {
    const router = new Resolver([
      { action, name: 'example', path: '/a' },
      { action, name: 'example', path: '/b' },
    ]);
    const url = generateUrls(router);
    expect(() => url('example')).to.throw(Error, /Duplicate route with name "example"/u);
  });

  it('should not throw an error for unique route name', () => {
    const router = new Resolver([
      { action, name: 'example', path: '/a' },
      { action, name: 'example', path: '/b' },
      { action, name: 'unique', path: '/c' },
    ]);
    const url = generateUrls(router);
    expect(() => url('unique')).to.not.throw();
  });

  it('should generate url for named routes', () => {
    const router1 = new Resolver({ action, name: 'user', path: '/:name' });
    const url1 = generateUrls(router1);
    expect(url1('user', { name: 'koistya' })).to.be.equal('/koistya');
    expect(() => url1('user')).to.throw(TypeError, /Expected "name" to be a string/u);

    const router2 = new Resolver({ action, name: 'user', path: '/user/:id' });
    const url2 = generateUrls(router2);
    expect(url2('user', { id: '123' })).to.be.equal('/user/123');
    expect(() => url2('user')).to.throw(TypeError, /Expected "id" to be a string/u);

    const router3 = new Resolver({ action, path: '/user/:id' });
    const url3 = generateUrls(router3);
    expect(() => url3('user')).to.throw(Error, /Route "user" not found/u);
  });

  it('should generate url for nested routes', () => {
    const resolver = new Resolver({
      __children: [
        {
          __children: [
            {
              name: 'c',
              path: '/c/:y',
            },
            { path: '/d' },
            { path: '/e' },
          ],
          name: 'b',
          path: '/b/:x',
        },
      ],
      name: 'a',
      path: '',
    });
    const url = generateUrls(resolver);
    expect(url('a')).to.be.equal('/');
    expect(url('b', { x: '123' })).to.be.equal('/b/123');
    expect(url('c', { x: 'i', y: 'j' })).to.be.equal('/b/i/c/j');
    // TODO(platosha): Re-enable assergin `routesByName` when the API is exposed
    // // the .keys assertion does not work with ES6 Maps until chai 4.x
    // let routesByName = Array.from(router.routesByName.keys());
    // expect(routesByName).to.have.all.members(['a', 'b', 'c']);

    (resolver.root.__children as Array<Route<undefined>>).push({ name: 'new', path: '/new', children: [] });
    expect(url('new')).to.be.equal('/new');
    // TODO(platosha): Re-enable assergin `routesByName` when the API is exposed
    // // the .keys assertion does not work with ES6 Maps until chai 4.x
    // routesByName = Array.from(router.routesByName.keys());
    // expect(routesByName).to.have.all.members(['a', 'b', 'c', 'new']);
  });

  it('should respect baseUrl', () => {
    // NOTE(platosha): the baseUrl support is only available in Vaadin.Router,
    // the generateUrls method should return clean urls without the base then.

    const options = { baseUrl: '/base/' };

    const router1 = new Resolver({ name: 'home', path: '', children: [] }, options);
    const url1 = generateUrls(router1);
    expect(url1('home')).to.be.equal('/');

    const router2 = new Resolver({ name: 'post', path: '/post/:id', children: [] }, options);
    const url2 = generateUrls(router2);
    expect(url2('post', { id: '12', x: 'y' })).to.be.equal('/post/12');

    const router3 = new Resolver<undefined>(
      {
        __children: [
          {
            name: 'b',
            path: '',
          },
          {
            __children: [
              {
                name: 'd',
                path: '/d/:y',
              },
            ],
            name: 'c',
            path: '/c/:x',
          },
        ],
        name: 'a',
        path: '',
      },
      options,
    );
    const url3 = generateUrls(router3);
    expect(url3('a')).to.be.equal('/');
    expect(url3('b')).to.be.equal('/');
    expect(url3('c', { x: 'x' })).to.be.equal('/c/x');
    expect(url3('d', { x: 'x', y: 'y' })).to.be.equal('/c/x/d/y');

    (router3.root.__children as Array<Route<undefined>>).push({ name: 'new', path: '/new' });
    expect(url3('new')).to.be.equal('/new');
  });

  it('should generate url with trailing slash', () => {
    const routes: readonly Route[] = [
      { name: 'a', path: '/', children: [] },
      {
        __children: [
          { name: 'b', path: '/', children: [] },
          { name: 'c', path: '/child/', children: [] },
        ],
        path: '/parent',
        children: [],
      },
    ];

    const router = new Resolver(routes);
    const url = generateUrls(router);
    expect(url('a')).to.be.equal('/');
    expect(url('b')).to.be.equal('/parent/');
    expect(url('c')).to.be.equal('/parent/child/');

    // NOTE(platosha): the baseUrl support is only available in Vaadin.Router,
    // the generateUrls method should return clean urls without the base then.
    const baseRouter = new Resolver(routes, { baseUrl: '/base/' });
    const baseUrl = generateUrls(baseRouter);
    expect(baseUrl('a')).to.be.equal('/');
    expect(baseUrl('b')).to.be.equal('/parent/');
    expect(baseUrl('c')).to.be.equal('/parent/child/');
  });

  it('should encode params', () => {
    const router = new Resolver({ name: 'user', path: '/:user', children: [] });

    const url = generateUrls(router);
    const prettyUrl = generateUrls(router, {
      encode(str) {
        return typeof str === 'string'
          ? encodeURI(str).replace(/[/?#]/gu, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
          : '';
      },
    });

    expect(url('user', { user: '#$&+,/:;=?@' })).to.be.equal('/%23%24%26%2B%2C%2F%3A%3B%3D%3F%40');
    expect(prettyUrl('user', { user: '#$&+,/:;=?@' })).to.be.equal('/%23$&+,%2F:;=%3F@');
  });

  it('should stringify query params (1)', () => {
    const router = new Resolver({ name: 'user', path: '/:user', children: [] });
    const stringifyQueryParams = sinon.spy<StringifyQueryParams>(() => 'qs');

    const url = generateUrls(router, { stringifyQueryParams });

    expect(url('user', { busy: '1', user: 'tj' })).to.be.equal('/tj?qs');
    expect(stringifyQueryParams.calledOnce).to.be.true;
    expect(stringifyQueryParams.args[0][0]).to.be.deep.equal({ busy: '1' });
  });

  it('should stringify query params (2)', () => {
    const router = new Resolver({ name: 'user', path: '/user/:username', children: [] });
    const stringifyQueryParams = sinon.spy<StringifyQueryParams>(() => '');

    const url = generateUrls(router, { stringifyQueryParams });

    expect(url('user', { busy: '1', username: 'tj' })).to.be.equal('/user/tj');
    expect(stringifyQueryParams.calledOnce).to.be.true;
    expect(stringifyQueryParams.args[0][0]).to.be.deep.equal({ busy: '1' });
  });

  it('should stringify query params (3)', () => {
    const router = new Resolver({ name: 'me', path: '/me', children: [] });
    const stringifyQueryParams = sinon.spy<StringifyQueryParams>(() => '?x=i&y=j&z=k');

    const url = generateUrls(router, { stringifyQueryParams });

    expect(url('me', { x: 'i', y: 'j', z: 'k' })).to.be.equal('/me?x=i&y=j&z=k');
    expect(stringifyQueryParams.calledOnce).to.be.true;
    expect(stringifyQueryParams.args[0][0]).to.be.deep.equal({ x: 'i', y: 'j', z: 'k' });
  });
});
