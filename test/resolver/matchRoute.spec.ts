/**
 * Universal Router (https://www.kriasoft.com/universal-router/)
 *
 * Copyright (c) 2015-present Kriasoft.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.txt file in the root directory of this source tree.
 */
import { expect, use } from '@esm-bundle/chai';
import chaiDom from 'chai-dom';
import sinonChai from 'sinon-chai';
import matchRoute from '../../src/resolver/matchRoute.js';
import '../setup.js';
import type { Route } from '../../src/resolver/types.t.js';

use(chaiDom);
use(sinonChai);

function toArray<T>(iter: Iterator<T>): readonly T[] {
  const arr = [];
  let res = iter.next();
  while (!res.done) {
    arr.push(res.value);
    res = iter.next();
  }
  return arr;
}

const dummyAction = () => undefined;

describe('matchRoute(route, pathname)', () => {
  it('should return a valid iterator', () => {
    const route: Route = {
      path: '/a',
      action: dummyAction,
    };
    const result = matchRoute(route, '/a');
    expect(result).to.be.an('object').and.not.be.null;
    expect(result).to.have.property('next').that.is.a('function');

    const item = result.next();
    expect(Boolean(item.done)).to.be.false;
    expect(item).to.have.property('value').that.is.an('object').and.is.not.null;

    const item2 = result.next();
    expect(item2).to.have.property('done', true);
  });

  it('should yield well-formed match objects', () => {
    const route: Route = {
      path: '/a',
      action: dummyAction,
    };
    const match = matchRoute(route, '/a').next().value;
    expect(match).to.have.property('route').that.is.an('object').and.is.not.null;
    expect(match).to.have.property('keys').that.is.an('array');
    expect(match).to.have.property('params').that.is.an('object').and.is.not.null;
    expect(match).to.have.property('path').that.is.an('string').and.is.not.null;
  });

  it('should treat undefined route path as ""', () => {
    // @ts-expect-error: Testing JS-specific behavior
    const result = toArray(matchRoute({ path: undefined, action: dummyAction }, ''));
    expect(result).to.have.lengthOf(1);
    expect(result[0]).to.have.nested.property('route.path', undefined);
  });

  describe('no matches', () => {
    it('should not match a route if it does not match the path', () => {
      const route: Route = {
        path: '/a',
        action: dummyAction,
      };
      const result = toArray(matchRoute(route, '/b'));
      expect(result).to.have.lengthOf(0);
    });

    it('should not match a child route that would have matched if it was on the root level', () => {
      const route: Route = {
        path: '/a',
        children: [{ path: '/b', action: dummyAction }],
      };
      const result = toArray(matchRoute(route, '/b'));
      expect(result).to.have.lengthOf(0);
    });

    it('should not match a route sequence which--when literally joined--matches the path', () => {
      const route: Route = {
        path: 'a',
        children: [{ path: 'b', action: dummyAction }],
      };
      const result = toArray(matchRoute(route, 'ab'));
      expect(result).to.have.lengthOf(0);
    });
  });

  describe('matches the root of the routes tree', () => {
    it('should match a route without children if it matches the path exactly', () => {
      const route: Route = {
        path: '/a',
        action: dummyAction,
      };
      const result = toArray(matchRoute(route, '/a'));
      expect(result).to.have.lengthOf(1);
      expect(result[0]).to.have.nested.property('route.path', '/a');
    });

    it('should not match a route without children if it matches only a prefix of the path', () => {
      const route: Route = {
        path: '/a',
        action: () => {},
      };
      const result = toArray(matchRoute(route, '/a/x'));
      expect(result).to.have.lengthOf(0);
    });

    it('should match a route with children if it matches the path exactly', () => {
      const route: Route = {
        path: '/a',
        children: [
          { path: '/b', action: dummyAction },
          { path: '/c', action: dummyAction },
          { path: '/d', action: dummyAction },
        ],
      };
      const result = toArray(matchRoute(route, '/a'));
      expect(result).to.have.lengthOf(1);
      expect(result[0]).to.have.nested.property('route.path', '/a');
    });

    it('should match a route with children if it matches only a prefix of the path', () => {
      const route: Route = {
        path: '/a',
        children: [
          { path: '/b', action: dummyAction },
          { path: '/c', action: dummyAction },
          { path: '/d', action: dummyAction },
        ],
      };
      const result = toArray(matchRoute(route, '/a/x'));
      expect(result).to.have.lengthOf(1);
      expect(result[0]).to.have.nested.property('route.path', '/a');
    });

    it('should use prefix-matching if the children property is truthy but is not an array of routes', () => {
      const route: Route = {
        path: '/a',
        children: () => [{ path: '/b', action: dummyAction }],
      };
      const result = toArray(matchRoute(route, '/a/x'));
      expect(result).to.have.lengthOf(1);
      expect(result[0]).to.have.nested.property('route.path', '/a');
    });

    it('should match a multi-segment route without children', () => {
      const route: Route = {
        path: '/a/b',
        action: dummyAction,
      };
      const result = toArray(matchRoute(route, '/a/b'));
      expect(result).to.have.lengthOf(1);
      expect(result[0]).to.have.nested.property('route.path', '/a/b');
    });
  });

  describe('matches child routes', () => {
    it('should match both the parent and one child route (parent first) - single child', () => {
      const route: Route = {
        path: '/a',
        children: [{ path: '/b', action: dummyAction }],
      };
      const result = toArray(matchRoute(route, '/a/b'));
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.have.nested.property('route.path', '/a');
      expect(result[1]).to.have.nested.property('route.path', '/b');
    });

    it('should match both the parent and one child route (parent first) - several children', () => {
      const route: Route = {
        path: '/a',
        children: [
          { path: '/b', action: dummyAction },
          { path: '/c', action: dummyAction },
          { path: '/d', action: dummyAction },
        ],
      };
      const result = toArray(matchRoute(route, '/a/d'));
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.have.nested.property('route.path', '/a');
      expect(result[1]).to.have.nested.property('route.path', '/d');
    });
  });

  describe('matches sibling routes', () => {
    it('should match all sibling routes in their definition order', () => {
      const route: Route = {
        path: '/a',
        children: [
          { path: '/b', action: dummyAction },
          { path: '/:id', action: dummyAction },
        ],
      };
      const result = toArray(matchRoute(route, '/a/b'));
      expect(result).to.have.lengthOf(3);
      expect(result[0]).to.have.nested.property('route.path', '/a');
      expect(result[1]).to.have.nested.property('route.path', '/b');
      expect(result[2]).to.have.nested.property('route.path', '/:id');
    });

    it('should match both a multi-segment no-children route and a route with children', () => {
      const route: Route = {
        path: '/a',
        children: [
          { path: '/b/c', action: dummyAction },
          {
            path: '/b',
            children: [{ path: '/c', action: dummyAction }],
          },
        ],
      };
      const result = toArray(matchRoute(route, '/a/b/c'));
      expect(result).to.have.lengthOf(4);
      expect(result[0]).to.have.nested.property('route.path', '/a');
      expect(result[1]).to.have.nested.property('route.path', '/b/c');
      expect(result[2]).to.have.nested.property('route.path', '/b');
      expect(result[3]).to.have.nested.property('route.path', '/c');
    });

    it('should continue matching on the parent level after siblings are checked', () => {
      const route: Route = {
        path: '/a',
        children: [
          {
            path: '/b',
            children: [{ path: '/c', action: dummyAction }],
          },
          { path: '/b/c', action: dummyAction },
        ],
      };
      const result = toArray(matchRoute(route, '/a/b/c'));
      expect(result).to.have.lengthOf(4);
      expect(result[0]).to.have.nested.property('route.path', '/a');
      expect(result[1]).to.have.nested.property('route.path', '/b');
      expect(result[2]).to.have.nested.property('route.path', '/c');
      expect(result[3]).to.have.nested.property('route.path', '/b/c');
    });
  });

  describe('leading and trailing "/" in the route path', () => {
    it('should match a relative route to a relative path', () => {
      const route: Route = {
        path: 'a',
        action: dummyAction,
      };
      const result = toArray(matchRoute(route, 'a'));
      expect(result).to.have.lengthOf(1);
      expect(result[0]).to.have.nested.property('route.path', 'a');
    });

    it('should not match an absolute route to a relative path', () => {
      const route: Route = {
        path: '/a',
        action: dummyAction,
      };
      const result = toArray(matchRoute(route, 'a'));
      expect(result).to.have.lengthOf(0);
    });

    it('should not match a relative route to an absolute path', () => {
      const route: Route = {
        path: 'a',
        action: dummyAction,
      };
      const result = toArray(matchRoute(route, '/a'));
      expect(result).to.have.lengthOf(0);
    });

    it('should match a route with a trailing "/" and no children to a path with a trailing "/"', () => {
      const route: Route = {
        path: 'a/',
        action: dummyAction,
      };
      const result = toArray(matchRoute(route, 'a/'));
      expect(result).to.have.lengthOf(1);
      expect(result[0]).to.have.nested.property('route.path', 'a/');
    });

    it('should match a route with a trailing "/" and some children to a path with a trailing "/"', () => {
      const route: Route = {
        path: 'a/',
        children: [
          { path: '/b', action: dummyAction },
          { path: '/c', action: dummyAction },
          { path: '/d', action: dummyAction },
        ],
      };
      const result = toArray(matchRoute(route, 'a/'));
      expect(result).to.have.lengthOf(1);
      expect(result[0]).to.have.nested.property('route.path', 'a/');
    });

    it('should match a route with a trailing "/" and some children to a path with more segments', () => {
      const route: Route = {
        path: 'a/',
        children: [
          { path: '/b', action: dummyAction },
          { path: '/c', action: dummyAction },
          { path: '/d', action: dummyAction },
        ],
      };
      const result = toArray(matchRoute(route, 'a/x'));
      expect(result).to.have.lengthOf(1);
      expect(result[0]).to.have.nested.property('route.path', 'a/');
    });

    it('should not match a route with a trailing "/" to a path without a trailing "/"', () => {
      const route: Route = {
        path: '/a/',
        action: dummyAction,
      };
      const result = toArray(matchRoute(route, '/a'));
      expect(result).to.have.lengthOf(0);
    });

    it('should match a route without a trailing "/" to a path with a trailing "/"', () => {
      const route: Route = {
        path: '/a',
        action: dummyAction,
      };
      const result = toArray(matchRoute(route, '/a/'));
      expect(result).to.have.lengthOf(1);
      expect(result[0]).to.have.nested.property('route.path', '/a');
    });

    it('should match child routes without the leading "/"', () => {
      const route: Route = {
        path: '/a',
        children: [{ path: 'b', action: dummyAction }],
      };
      const result = toArray(matchRoute(route, '/a/b'));
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.have.nested.property('route.path', '/a');
      expect(result[1]).to.have.nested.property('route.path', 'b');
    });

    it('should match parent routes with a trailing "/" and child routes with a leading "/"', () => {
      const route: Route = {
        path: '/a/',
        children: [{ path: '/b', action: dummyAction }],
      };
      const result = toArray(matchRoute(route, '/a/b'));
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.have.nested.property('route.path', '/a/');
      expect(result[1]).to.have.nested.property('route.path', '/b');
    });

    it('should match parent routes with a trailing "/" and child routes without a leading "/"', () => {
      const route: Route = {
        path: '/a/',
        children: [{ path: 'b', action: dummyAction }],
      };
      const result = toArray(matchRoute(route, '/a/b'));
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.have.nested.property('route.path', '/a/');
      expect(result[1]).to.have.nested.property('route.path', 'b');
    });

    it('should match deep child routes without a leading "/"', () => {
      const route: Route = {
        path: '/a',
        children: [
          {
            path: 'b',
            children: [{ path: 'c', action: dummyAction }],
          },
        ],
      };
      const result = toArray(matchRoute(route, '/a/b/c'));
      expect(result).to.have.lengthOf(3);
      expect(result[0]).to.have.nested.property('route.path', '/a');
      expect(result[1]).to.have.nested.property('route.path', 'b');
      expect(result[2]).to.have.nested.property('route.path', 'c');
    });

    it('should match child routes if the path has a trailing "/"', () => {
      const route: Route = {
        path: '/a',
        children: [{ path: 'b', action: dummyAction }],
      };
      const result = toArray(matchRoute(route, '/a/b/'));
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.have.nested.property('route.path', '/a');
      expect(result[1]).to.have.nested.property('route.path', 'b');
    });
  });

  describe('"" and "/" routes', () => {
    it('should not match a "" route without children to any other path than ""', () => {
      expect(toArray(matchRoute({ path: '', action: dummyAction }, '/'))).to.have.lengthOf(0);
      expect(toArray(matchRoute({ path: '', action: dummyAction }, '/a'))).to.have.lengthOf(0);
      expect(toArray(matchRoute({ path: '', action: dummyAction }, 'a'))).to.have.lengthOf(0);
    });

    it('should match a "" route with children to an absolute path', () => {
      const route: Route = {
        path: '',
        children: [
          { path: '/b', action: dummyAction },
          { path: '/c', action: dummyAction },
          { path: '/d', action: dummyAction },
        ],
      };
      const result = toArray(matchRoute(route, '/a'));
      expect(result).to.have.lengthOf(1);
      expect(result[0]).to.have.nested.property('route.path', '');
    });

    it('should match a "" route with children to an relative path', () => {
      const route: Route = {
        path: '',
        children: [
          { path: '/b', action: dummyAction },
          { path: '/c', action: dummyAction },
          { path: '/d', action: dummyAction },
        ],
      };
      const result = toArray(matchRoute(route, 'a'));
      expect(result).to.have.lengthOf(1);
      expect(result[0]).to.have.nested.property('route.path', '');
    });

    it('should match absolute children of a "" route to an absolute path', () => {
      const route: Route = {
        path: '',
        children: [{ path: '/a', action: dummyAction }],
      };
      const result = toArray(matchRoute(route, '/a'));
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.have.nested.property('route.path', '');
      expect(result[1]).to.have.nested.property('route.path', '/a');
    });

    it('should match relative children of a "" route to a relative path', () => {
      const route: Route = {
        path: '',
        children: [{ path: 'a', action: dummyAction }],
      };
      const result = toArray(matchRoute(route, 'a'));
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.have.nested.property('route.path', '');
      expect(result[1]).to.have.nested.property('route.path', 'a');
    });

    it('should not match absolute children of a "" route to an relative path', () => {
      const route: Route = {
        path: '',
        children: [{ path: '/a', action: dummyAction }],
      };
      const result = toArray(matchRoute(route, 'a'));
      expect(result).to.have.lengthOf(1);
    });

    it('should not match relative children of a "" route to an absolute path', () => {
      const route: Route = {
        path: '',
        children: [{ path: 'a', action: dummyAction }],
      };
      const result = toArray(matchRoute(route, '/a'));
      expect(result).to.have.lengthOf(1);
    });

    it('should match a child "" route if the path does not have a trailing "/"', () => {
      const route: Route = {
        path: '/a',
        children: [{ path: '', action: dummyAction }],
      };
      const result = toArray(matchRoute(route, '/a'));
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.have.nested.property('route.path', '/a');
      expect(result[1]).to.have.nested.property('route.path', '');
    });

    it('should match a child "" route if the path does have a trailing "/"', () => {
      const route: Route = {
        path: '/a',
        children: [{ path: '', action: dummyAction }],
      };
      const result = toArray(matchRoute(route, '/a/'));
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.have.nested.property('route.path', '/a');
      expect(result[1]).to.have.nested.property('route.path', '');
    });

    it('should match both the parent and the child "" routes', () => {
      const route: Route = {
        path: '',
        name: 'parent',
        children: [
          {
            path: '',
            name: 'child',
            children: [{ path: 'a', action: dummyAction }],
          },
        ],
      };
      const result = toArray(matchRoute(route, 'a'));
      expect(result).to.have.lengthOf(3);
      expect(result[0]).to.have.nested.property('route.name', 'parent');
      expect(result[1]).to.have.nested.property('route.name', 'child');
      expect(result[2]).to.have.nested.property('route.path', 'a');
    });

    it('should match several nested "" routes', () => {
      const route: Route = {
        path: '',
        name: 'level-1',
        children: [
          {
            path: '',
            name: 'level-2',
            children: [
              {
                path: '',
                name: 'level-3',
                children: [
                  { path: '', name: 'level-4', action: dummyAction },
                  { path: '/a', action: dummyAction },
                ],
              },
            ],
          },
        ],
      };
      const result = toArray(matchRoute(route, '/a'));
      expect(result).to.have.lengthOf(4);
      expect(result[0]).to.have.nested.property('route.name', 'level-1');
      expect(result[1]).to.have.nested.property('route.name', 'level-2');
      expect(result[2]).to.have.nested.property('route.name', 'level-3');
      expect(result[3]).to.have.nested.property('route.path', '/a');
    });

    it('should not match a "/" route without children to any other path than "/"', () => {
      expect(toArray(matchRoute({ path: '/', action: dummyAction }, ''))).to.have.lengthOf(0);
      expect(toArray(matchRoute({ path: '/', action: dummyAction }, '/a'))).to.have.lengthOf(0);
      expect(toArray(matchRoute({ path: '/', action: dummyAction }, 'a'))).to.have.lengthOf(0);
    });

    it('should match a "/" route with children to an absolute path', () => {
      const route: Route = {
        path: '/',
        children: [
          { path: '/b', action: dummyAction },
          { path: '/c', action: dummyAction },
          { path: '/d', action: dummyAction },
        ],
      };
      const result = toArray(matchRoute(route, '/a'));
      expect(result).to.have.lengthOf(1);
      expect(result[0]).to.have.nested.property('route.path', '/');
    });

    it('should not match a "/" route with children to a relative path', () => {
      const route: Route = {
        path: '/',
        children: [{ path: 'a', action: dummyAction }],
      };
      const result = toArray(matchRoute(route, 'a'));
      expect(result).to.have.lengthOf(0);
    });

    it('should match (absolute) children of a "/" route', () => {
      const route: Route = {
        path: '/',
        children: [{ path: '/a', action: dummyAction }],
      };
      const result = toArray(matchRoute(route, '/a'));
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.have.nested.property('route.path', '/');
      expect(result[1]).to.have.nested.property('route.path', '/a');
    });

    it('should match (relative) children of a "/" route', () => {
      const route: Route = {
        path: '/',
        children: [{ path: 'a', action: dummyAction }],
      };
      const result = toArray(matchRoute(route, '/a'));
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.have.nested.property('route.path', '/');
      expect(result[1]).to.have.nested.property('route.path', 'a');
    });

    it('should match a child "/" route if the path does not have a trailing "/"', () => {
      const route: Route = {
        path: '/a',
        children: [{ path: '/', action: dummyAction }],
      };
      const result = toArray(matchRoute(route, '/a'));
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.have.nested.property('route.path', '/a');
      expect(result[1]).to.have.nested.property('route.path', '/');
    });

    it('should match a child "/" route if the path does have a trailing "/"', () => {
      const route: Route = {
        path: '/a',
        children: [{ path: '/', action: dummyAction }],
      };
      const result = toArray(matchRoute(route, '/a/'));
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.have.nested.property('route.path', '/a');
      expect(result[1]).to.have.nested.property('route.path', '/');
    });

    it('should match both the parent and the child "/" routes', () => {
      const route: Route = {
        path: '/',
        name: 'parent',
        children: [
          {
            path: '/',
            name: 'child',
            children: [{ path: 'a', action: dummyAction }],
          },
        ],
      };
      const result = toArray(matchRoute(route, '/a'));
      expect(result).to.have.lengthOf(3);
      expect(result[0]).to.have.nested.property('route.name', 'parent');
      expect(result[1]).to.have.nested.property('route.name', 'child');
      expect(result[2]).to.have.nested.property('route.path', 'a');
    });

    it('should match several nested "/" routes', () => {
      const route: Route = {
        path: '/',
        name: 'level-1',
        children: [
          {
            path: '/',
            name: 'level-2',
            children: [
              {
                path: '/',
                name: 'level-3',
                children: [
                  { path: '/', name: 'level-4', action: dummyAction },
                  { path: '/a', action: dummyAction },
                ],
              },
            ],
          },
        ],
      };
      const result = toArray(matchRoute(route, '/a'));
      expect(result).to.have.lengthOf(4);
      expect(result[0]).to.have.nested.property('route.name', 'level-1');
      expect(result[1]).to.have.nested.property('route.name', 'level-2');
      expect(result[2]).to.have.nested.property('route.name', 'level-3');
      expect(result[3]).to.have.nested.property('route.path', '/a');
    });

    it('should not match a deep child with a leading "/" if all parents are "" and the path is relative', () => {
      const route: Route = {
        path: '',
        name: 'parent',
        children: [
          {
            path: '',
            name: 'child',
            children: [{ path: '/a', action: dummyAction }],
          },
        ],
      };
      const result = toArray(matchRoute(route, 'a'));
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.have.nested.property('route.name', 'parent');
      expect(result[1]).to.have.nested.property('route.name', 'child');
    });

    it('should match a deep child without a leading "/" if all parents are "" and the path is relative', () => {
      const route: Route = {
        path: '',
        name: 'parent',
        children: [
          {
            path: '',
            name: 'child',
            children: [{ path: 'a', action: dummyAction }],
          },
        ],
      };
      const result = toArray(matchRoute(route, 'a'));
      expect(result).to.have.lengthOf(3);
      expect(result[0]).to.have.nested.property('route.name', 'parent');
      expect(result[1]).to.have.nested.property('route.name', 'child');
      expect(result[2]).to.have.nested.property('route.path', 'a');
    });
  });

  describe('keys and params in the match object', () => {
    it('should contain the keys and params of the matched route', () => {
      const route: Route = {
        path: '/a/:b',
        action: dummyAction,
      };

      const result = toArray(matchRoute(route, '/a/1'));
      expect(result[0]).to.have.property('keys').that.is.an('array').and.is.lengthOf(1);
      expect(result[0]).to.have.property('params').that.is.deep.equal({ b: '1' });
    });

    it('should contain the keys and params of the parent route', () => {
      const route: Route = {
        path: '/a/:b',
        children: [{ path: '/:c', action: dummyAction }],
      };

      const result = toArray(matchRoute(route, '/a/1/2'));
      expect(result[1]).to.have.property('keys').that.is.an('array').and.is.lengthOf(2);
      expect(result[1]).to.have.property('params').that.is.deep.equal({ b: '1', c: '2' });
    });

    it('should be empty if neither the matched route nor its parents have any params', () => {
      const route: Route = {
        path: '/a',
        children: [{ path: '/b', action: dummyAction }],
      };

      const result = toArray(matchRoute(route, '/a/b'));
      expect(result[0]).to.have.property('keys').that.is.an('array').and.is.lengthOf(0);
      expect(result[0]).to.have.property('params').that.is.deep.equal({});
      expect(result[1]).to.have.property('keys').that.is.an('array').and.is.lengthOf(0);
      expect(result[1]).to.have.property('params').that.is.deep.equal({});
    });

    it('should not contain the keys and params of the child routes', () => {
      const route: Route = {
        path: '/a/:b',
        children: [{ path: '/:c', action: dummyAction }],
      };

      const result = toArray(matchRoute(route, '/a/1/2'));
      expect(result[0]).to.have.property('keys').that.is.an('array').and.is.lengthOf(1);
      expect(result[0]).to.have.property('params').that.is.deep.equal({ b: '1' });
    });

    it('should not contain the keys and params of the sibling routes', () => {
      const route: Route = {
        path: '/a/:b',
        children: [
          { path: '/:c', action: dummyAction },
          { path: '/2', action: dummyAction },
        ],
      };

      const result = toArray(matchRoute(route, '/a/1/2'));
      expect(result[2]).to.have.property('keys').that.is.an('array').and.is.lengthOf(1);
      expect(result[2]).to.have.property('params').that.is.deep.equal({ b: '1' });
    });

    it('should override a parent route param value with that of a child route if the param names collide', () => {
      const route: Route = {
        path: '/a/:b',
        children: [{ path: '/:b', action: dummyAction }],
      };

      const result = toArray(matchRoute(route, '/a/1/2'));
      expect(result[1]).to.have.property('params').that.is.deep.equal({ b: '2' });
    });

    it('should not override a parent route param value with `undefined` (for an optional child param)', () => {
      const route: Route = {
        path: '/a/:b',
        children: [{ path: '/:b?', action: dummyAction }],
      };

      const result = toArray(matchRoute(route, '/a/1'));
      expect(result[1]).to.have.property('params').that.is.deep.equal({ b: '1' });
    });

    it('should not override a parent route param value in the parent match', () => {
      const route: Route = {
        path: '/a/:b',
        children: [{ path: '/:b', action: dummyAction }],
      };

      const result = toArray(matchRoute(route, '/a/1'));
      expect(result[0]).to.have.property('params').that.is.deep.equal({ b: '1' });
    });
  });
});
