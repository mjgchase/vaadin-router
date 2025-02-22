import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { Router, type RouterLocation } from '../../src/index.js';
import Resolver from '../../src/resolver/resolver.js';
import '../setup.js';
import type { MaybePromise } from '../../src/resolver/types.t.js';
import type {
  Commands,
  Route,
  RouteContext,
  VaadinRouterErrorEvent,
  VaadinRouterLocationChangedEvent,
  WebComponentInterface,
} from '../../src/types.t.js';
import {
  checkOutletContents,
  cleanup,
  onAfterEnterAction,
  onAfterLeaveAction,
  onBeforeEnterAction,
  onBeforeLeaveAction,
  verifyActiveRoutes,
} from './test-utils.js';

declare global {
  interface HTMLElementTagNameMap {
    'x-persistent-view': HTMLElement;
    'x-spy': XSpy;
  }
}

let callbacksLog: string[] = [];

class XSpy extends HTMLElement implements WebComponentInterface {
  location?: RouterLocation;
  name?: string;

  connectedCallback() {
    callbacksLog.push(`${this.name ?? 'x-spy'}.connectedCallback`);
  }
  disconnectedCallback() {
    callbacksLog.push(`${this.name ?? 'x-spy'}.disconnectedCallback`);
  }
  onBeforeEnter(): MaybePromise<undefined> {
    callbacksLog.push(`${this.name ?? 'x-spy'}.onBeforeEnter`);
    return undefined;
  }
  onAfterEnter() {
    callbacksLog.push(`${this.name ?? 'x-spy'}.onAfterEnter`);
  }
  onBeforeLeave(): MaybePromise<undefined> {
    callbacksLog.push(`${this.name ?? 'x-spy'}.onBeforeLeave`);
    return undefined;
  }
  onAfterLeave() {
    callbacksLog.push(`${this.name ?? 'x-spy'}.onAfterLeave`);
  }
}
customElements.define('x-spy', XSpy);

function extractLifeCycleCallbackCallArgs(
  callback: sinon.SinonSpy,
): readonly [location: RouterLocation, commands: Commands, router: Router] {
  return callback.firstCall.args as [RouterLocation, Commands, Router];
}

const elementWithAllLifecycleCallbacks = (elementName: string) => (_context: RouteContext, commands: Commands) => {
  callbacksLog.push(`${elementName}.action`);
  const component = commands.component('x-spy') as WebComponentInterface;
  component.name = elementName;
  return component;
};

const elementWithUserParameter = () => (context: RouteContext, commands: Commands) => {
  const elementName = `x-user-${String(context.params.user ?? '')}`;
  callbacksLog.push(`${elementName}.action`);
  const component = commands.component('x-spy') as WebComponentInterface;
  if (!component.name) {
    component.name = elementName;
  }
  return component;
};

const sleep = async (ms: number) =>
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('Vaadin Router lifecycle events', () => {
  const verifyCallbacks = (expectedCallbacks: readonly string[]) => {
    expect(callbacksLog).to.be.an('array');
    expect(expectedCallbacks).to.be.an('array');

    try {
      expect(callbacksLog).to.deep.equal(expectedCallbacks);
    } catch (e) {
      const comparisonTable = [['expected', 'actual']];
      for (let i = 0; i < Math.max(expectedCallbacks.length, callbacksLog.length); i++) {
        comparisonTable.push([expectedCallbacks[i], callbacksLog[i]]);
      }
      // eslint-disable-next-line no-console
      console.table(comparisonTable);
      throw e;
    }
  };

  let outlet: HTMLElement;
  let router: Router;

  before(() => {
    outlet = document.createElement('div');
    document.body.append(outlet);
    history.pushState(null, '', '/');
  });

  after(() => {
    outlet.remove();
    history.back();
  });

  beforeEach(() => {
    // create a new router instance
    router = new Router(outlet);
    history.replaceState(null, '', '/');
  });

  afterEach(() => {
    router.unsubscribe();
    cleanup(outlet);
    callbacksLog = [];
  });

  describe('onBeforeEnter', () => {
    it('should be called with 3 arguments: [location, commands, router]', async () => {
      const onBeforeEnter = sinon.spy();
      await router.setRoutes([{ path: '/', action: onBeforeEnterAction('x-home-view', onBeforeEnter) }], true);

      await router.render('/');

      expect(onBeforeEnter).to.have.been.calledOnce;
      expect(onBeforeEnter.args[0].length).to.equal(3);

      const [location, commands, routerArg] = extractLifeCycleCallbackCallArgs(onBeforeEnter);

      expect(location.pathname).to.equal('/');
      expect(location.route?.path).to.equal('/');

      expect(commands).to.be.an('object').that.is.not.null;

      expect(routerArg).to.equal(router);

      expect(outlet.children[0].tagName).to.match(/x-home-view/iu);
    });

    it('should be called on the route web component instance (as `this`)', async () => {
      const onBeforeEnter = sinon.spy();
      await router.setRoutes([{ path: '/', action: onBeforeEnterAction('x-home-view', onBeforeEnter) }], true);

      await router.render('/');

      expect(onBeforeEnter).to.have.been.calledOn(outlet.children[0]);
      expect(outlet.children[0].tagName).to.match(/x-home-view/iu);
    });

    it('should be able to return a `prevent` command to prevent navigation', async () => {
      await router.setRoutes(
        [
          { path: '/', action: onBeforeEnterAction('whatever', (_location, commands) => commands.prevent()) },
          { path: '/users', component: 'x-users-list' },
        ],
        true,
      );

      await router.render('/users');
      await router.render('/');

      expect(outlet.children[0].tagName).to.match(/x-users-list/iu);
      verifyActiveRoutes(router, ['/users']);
    });

    it('should keep the location when route is prevented on before enter', async () => {
      // this test is not failed on chrome before #365
      // probably because of https://bugs.chromium.org/p/chromium/issues/detail?id=983094
      let preventNavigation = false;
      await router.setRoutes(
        [
          {
            path: '/',
            action: onBeforeEnterAction('x-home-view', (_location, commands) =>
              preventNavigation ? commands.prevent() : undefined,
            ),
          },
          { path: '/users', component: 'x-users-list' },
        ],
        true,
      );
      await router.ready;
      expect(window.location.pathname).to.be.equal('/');

      await router.render({ pathname: '/users', search: '', hash: '' }, true);
      expect(window.location.pathname).to.be.equal('/users');

      preventNavigation = true;
      window.history.back();
      await router.ready;
      expect(window.location.pathname).to.be.equal('/users');

      expect(outlet.children[0].tagName).to.match(/x-users-list/iu);
      verifyActiveRoutes(router, ['/users']);
    });

    it('should be able to return a `redirect` command to redirect navigation', async () => {
      await router.setRoutes(
        [
          { path: '/', action: onBeforeEnterAction('whatever', (_location, commands) => commands.redirect('/users')) },
          { path: '/users', component: 'x-users-list' },
        ],
        true,
      );

      await router.render('/');

      expect(outlet.children[0].tagName).to.match(/x-users-list/iu);
      verifyActiveRoutes(router, ['/users']);
    });

    it('should be able to have multiple redirects', async () => {
      await router.setRoutes(
        [
          {
            path: '/',
            action: onBeforeEnterAction('x-redirect-component', (_location, commands) => commands.redirect('/u')),
          },
          {
            path: '/u',
            action: onBeforeEnterAction('x-redirect-component', (_location, commands) => commands.redirect('/users')),
          },
          { path: '/users', component: 'x-users-list' },
        ],
        true,
      );

      await router.render('/');

      expect(outlet.children[0].tagName).to.match(/x-users-list/iu);
      verifyActiveRoutes(router, ['/users']);
    });

    it('should fail on recursive redirects', async () => {
      await router.setRoutes(
        [
          {
            path: '/',
            action: onBeforeEnterAction('x-redirect-component', (_location, commands) => commands.redirect('/u')),
          },
          {
            path: '/u',
            action: onBeforeEnterAction('x-redirect-component', (_location, commands) => commands.redirect('/users')),
          },
          {
            path: '/users',
            action: onBeforeEnterAction('x-redirect-component', (_location, commands) => commands.redirect('/')),
          },
        ],
        true,
      );

      const onError = sinon.spy((_: unknown) => {});
      await router.render('/').catch(onError);

      expect(outlet.children).to.have.lengthOf(0);
      expect(onError).to.have.been.calledOnce;
    });

    it('should ignore any other return value than `prevent` or `redirect`', async () => {
      const values = [
        true,
        false,
        0,
        42,
        [],
        // eslint-disable-next-line camelcase
        { not_a_redirect: true },
        null,
        undefined,
        () => true,
        'random-tag-name',
        document.createElement('div'),
      ];

      for (const value of values) {
        const onBeforeEnter = sinon.stub().returns(value);
        // eslint-disable-next-line no-await-in-loop
        await router.setRoutes(
          [
            { path: '/', action: onBeforeEnterAction('x-home-view', onBeforeEnter) },
            { path: '/users', component: 'x-users-list' },
          ],
          true,
        );

        // eslint-disable-next-line no-await-in-loop
        await router.render('/');
        expect(outlet.children[0].tagName).to.match(/x-home-view/iu);
        verifyActiveRoutes(router, ['/']);
      }
    });

    it('should support returning a promise (and continue the resolve pass after the promise resolves)', async () => {
      await router.setRoutes(
        [
          {
            path: '/a',
            action: onBeforeEnterAction(
              'x-spy',
              async () => {
                callbacksLog.push('a.onBeforeEnter');
                await sleep(100);
                callbacksLog.push('a.onBeforeEnter.promise');
                return undefined;
              },
              'a',
            ),
          },
          { path: '/b', component: 'x-spy' },
        ],
        true,
      );

      await router.render('/a');

      verifyCallbacks(['a.onBeforeEnter', 'a.onBeforeEnter.promise', 'a.connectedCallback', 'a.onAfterEnter']);
    });

    it('should not re-render the same component if `onBeforeLeave` prevented navigation', async () => {
      let counter = 0;

      customElements.define(
        'x-persistent-view',
        class PersistentView extends HTMLElement implements WebComponentInterface {
          connectedCallback(): void {
            counter += 1;
          }
          onBeforeLeave(_location: RouterLocation, commands: Commands) {
            return commands.prevent();
          }
        },
      );
      await router.setRoutes(
        [
          { path: '/', component: 'x-home-view' },
          { path: '/users', component: 'x-persistent-view' },
        ],
        true,
      );
      await router.render('/users');
      await router.render('/');
      expect(outlet.children[0].tagName).to.match(/x-persistent-view/iu);
      expect(counter).to.equal(1);
    });
  });

  describe('onBeforeLeave', () => {
    it('should be called with 3 arguments: [location, commands, router]', async () => {
      const onBeforeLeave = sinon.spy();
      await router.setRoutes(
        [
          { path: '/', action: onBeforeLeaveAction('x-home-view', onBeforeLeave) },
          { path: '/users', component: 'x-users-list' },
        ],
        true,
      );

      await router.render('/');
      expect(onBeforeLeave).to.not.have.been.called;

      await router.render('/users');

      expect(onBeforeLeave).to.have.been.calledOnce;
      expect(onBeforeLeave.args[0].length).to.equal(3);

      const [location, commands, routerArg] = extractLifeCycleCallbackCallArgs(onBeforeLeave);

      expect(location.pathname).to.equal('/users');
      expect(location.route?.path).to.equal('/users');

      expect(commands).to.be.an('object').that.is.not.null;

      expect(routerArg).to.equal(router);

      expect(outlet.children[0].tagName).to.match(/x-users-list/iu);
    });

    it('should be called on the route web component instance (as `this`)', async () => {
      const onBeforeLeave = sinon.spy();
      await router.setRoutes([
        { path: '/', action: onBeforeLeaveAction('x-home-view', onBeforeLeave) },
        { path: '/users', component: 'x-users-list' },
      ]);

      await router.render('/');
      const [homeViewElement] = outlet.children;

      await router.render('/users');

      expect(onBeforeLeave).to.have.been.calledOn(homeViewElement);
      expect(outlet.children[0].tagName).to.match(/x-users-list/iu);
    });

    it('should be able to return a `prevent` command to prevent navigation', async () => {
      await router.setRoutes([
        { path: '/', action: onBeforeLeaveAction('x-home-view', (_location, commands) => commands.prevent()) },
        { path: '/users', component: 'x-users-list' },
      ]);

      await router.render('/');
      await router.render('/users');

      expect(outlet.children[0].tagName).to.match(/x-home-view/iu);
      verifyActiveRoutes(router, ['/']);
    });

    it('should keep the location when route is prevented on before leave', async () => {
      // this test is not failed on chrome before #365
      // probably because of https://bugs.chromium.org/p/chromium/issues/detail?id=983094
      let preventNavigation = false;
      await router.setRoutes([
        {
          path: '/',
          action: onBeforeLeaveAction('x-home-view', (_location, commands) =>
            preventNavigation ? commands.prevent() : undefined,
          ),
        },
        { path: '/users', component: 'x-users-list' },
      ]);
      await router.ready;
      expect(window.location.pathname).to.be.equal('/');

      await router.render({ pathname: '/users', search: '', hash: '' }, true);
      expect(window.location.pathname).to.be.equal('/users');

      await router.render({ pathname: '/', search: '', hash: '' }, true);
      expect(window.location.pathname).to.be.equal('/');

      preventNavigation = true;
      window.history.back();
      await router.ready;
      expect(window.location.pathname).to.be.equal('/');

      expect(outlet.children[0].tagName).to.match(/x-home-view/iu);
      verifyActiveRoutes(router, ['/']);
    });

    it('should ignore any other return value than `prevent`', async () => {
      const values = [
        true,
        false,
        0,
        42,
        [],
        // eslint-disable-next-line camelcase
        { not_a_redirect: true },
        { redirect: { pathname: '/' } },
        null,
        undefined,
        () => true,
        'random-tag-name',
        document.createElement('div'),
      ];

      for (const value of values) {
        const onBeforeLeave = sinon.stub().returns(value);
        // eslint-disable-next-line no-await-in-loop
        await router.setRoutes([
          { path: '/', action: onBeforeLeaveAction('x-home-view', onBeforeLeave) },
          { path: '/users', component: 'x-users-list' },
        ]);

        // eslint-disable-next-line no-await-in-loop
        await router.render('/');
        // eslint-disable-next-line no-await-in-loop
        await router.render('/users');
        expect(outlet.children[0].tagName).to.match(/x-users-list/iu);
        verifyActiveRoutes(router, ['/users']);
      }
    });

    it('should support returning a promise (and continue the resolve pass after the promise resolves)', async () => {
      await router.setRoutes(
        [
          {
            path: '/a',
            action: onBeforeLeaveAction(
              'x-spy',
              async () => {
                callbacksLog.push('a.onBeforeLeave');
                await sleep(100);
                callbacksLog.push('a.onBeforeLeave.promise');
                return undefined;
              },
              'a',
            ),
          },
          { path: '/b', action: elementWithAllLifecycleCallbacks('b') },
        ],
        true,
      );

      await router.render('/').catch(() => {});
      await router.render('/a');
      callbacksLog = [];
      await router.render('/b');

      verifyCallbacks([
        'b.action',
        'a.onBeforeLeave',
        'a.onBeforeLeave.promise',
        'b.onBeforeEnter',
        'b.connectedCallback',
        'b.onAfterEnter',
        'a.onAfterLeave',
        'a.disconnectedCallback',
      ]);
    });

    it('should not re-render the same component if `onBeforeEnter` prevented navigation', async () => {
      let counter = 0;
      customElements.define(
        'x-root-view',
        class extends HTMLElement {
          // eslint-disable-next-line @typescript-eslint/class-methods-use-this
          connectedCallback(): void {
            counter += 1;
          }
        },
      );
      customElements.define(
        'x-disallowed-view',
        class extends HTMLElement implements WebComponentInterface {
          onBeforeEnter(_location: RouterLocation, commands: Commands) {
            return commands.prevent();
          }
        },
      );
      await router.setRoutes([
        { path: '/', component: 'x-root-view' },
        { path: '/users', component: 'x-disallowed-view' },
      ]);
      await router.render('/');
      await router.render('/users');
      expect(outlet.children[0].tagName).to.match(/x-root-view/iu);
      expect(counter).to.equal(1);
    });
  });

  describe('onAfterLeave', () => {
    it('should be called with 3 arguments: [location, commands, router]', async () => {
      const onAfterLeave = sinon.spy();
      await router.setRoutes(
        [
          { path: '/', action: onAfterLeaveAction('x-home-view', onAfterLeave) },
          { path: '/users', component: 'x-users-list' },
        ],
        true,
      );

      await router.render('/');

      expect(onAfterLeave).not.to.have.been.called;

      await router.render('/users');

      expect(onAfterLeave).to.have.been.calledOnce;
      expect(onAfterLeave.args[0].length).to.equal(3);

      const [location, commands, routerArg] = extractLifeCycleCallbackCallArgs(onAfterLeave);

      expect(location.pathname).to.equal('/users');
      expect(location.route?.path).to.equal('/users');

      expect(commands).to.be.an('object').that.is.not.null;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(commands.prevent).to.be.undefined;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(commands.redirect).to.be.undefined;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(commands.component).to.be.undefined;

      expect(routerArg).to.equal(router);

      expect(outlet.children[0].tagName).to.match(/x-users-list/iu);
    });

    it('should be called on the route web component instance (as `this`)', async () => {
      const onAfterLeave = sinon.spy();
      await router.setRoutes([
        { path: '/', action: onAfterLeaveAction('x-home-view', onAfterLeave) },
        { path: '/users', component: 'x-users-list' },
      ]);

      await router.render('/');
      const [homeViewElement] = outlet.children;

      await router.render('/users');

      expect(onAfterLeave).to.have.been.calledOn(homeViewElement);
      expect(outlet.children[0].tagName).to.match(/x-users-list/iu);
    });

    it('should ignore all return values', async () => {
      const values = [
        true,
        false,
        0,
        42,
        [],
        // eslint-disable-next-line camelcase
        { not_a_redirect: true },
        { redirect: { pathname: '/' } },
        { cancel: true },
        null,
        undefined,
        () => true,
        'random-tag-name',
        document.createElement('div'),
      ];

      for (const value of values) {
        const onAfterLeave = sinon.stub().returns(value);
        // eslint-disable-next-line no-await-in-loop
        await router.setRoutes([
          { path: '/', action: onAfterLeaveAction('x-home-view', onAfterLeave) },
          { path: '/users', component: 'x-users-list' },
        ]);

        // eslint-disable-next-line no-await-in-loop
        await router.render('/');
        // eslint-disable-next-line no-await-in-loop
        await router.render('/users');
        expect(outlet.children[0].tagName).to.match(/x-users-list/iu);
        verifyActiveRoutes(router, ['/users']);
      }
    });
  });

  describe('onAfterEnter', () => {
    it('should be called with 3 argument: [location, commands, router]', async () => {
      const onAfterEnter = sinon.spy();
      await router.setRoutes([{ path: '/', action: onAfterEnterAction('x-home-view', onAfterEnter) }], true);

      await router.render('/');

      expect(onAfterEnter).to.have.been.calledOnce;
      expect(onAfterEnter.args[0].length).to.equal(3);

      const [location, commands, routerArg] = extractLifeCycleCallbackCallArgs(onAfterEnter);

      expect(location.pathname).to.equal('/');
      expect(location.route?.path).to.equal('/');

      expect(commands).to.be.an('object').that.is.not.null;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(commands.prevent).to.be.undefined;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(commands.redirect).to.be.undefined;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(commands.component).to.be.undefined;

      expect(routerArg).to.equal(router);

      expect(outlet.children[0].tagName).to.match(/x-home-view/iu);
    });

    it('should be called on the route web component instance (as `this`)', async () => {
      const onAfterEnter = sinon.spy();
      await router.setRoutes([{ path: '/', action: onAfterEnterAction('x-home-view', onAfterEnter) }], true);

      await router.render('/');

      expect(onAfterEnter).to.have.been.calledOn(outlet.children[0]);
      expect(outlet.children[0].tagName).to.match(/x-home-view/iu);
    });

    it('should ignore all return values', async () => {
      const values = [
        true,
        false,
        0,
        42,
        [],
        // eslint-disable-next-line camelcase
        { not_a_redirect: true },
        { redirect: { pathname: '/' } },
        { cancel: true },
        null,
        undefined,
        () => true,
        'random-tag-name',
        document.createElement('div'),
      ];

      for (const value of values) {
        const onAfterEnter = sinon.stub().returns(value);
        // eslint-disable-next-line no-await-in-loop
        await router.setRoutes(
          [
            { path: '/', action: onAfterEnterAction('x-home-view', onAfterEnter) },
            { path: '/users', component: 'x-users-list' },
          ],
          true,
        );

        // eslint-disable-next-line no-await-in-loop
        await router.render('/');
        // eslint-disable-next-line no-await-in-loop
        await router.render('/users');
        expect(outlet.children[0].tagName).to.match(/x-users-list/iu);
        verifyActiveRoutes(router, ['/users']);
      }
    });
  });

  describe('the order of lifecycle events (without early returns)', () => {
    function action() {
      callbacksLog.push('a.action');
      return undefined;
    }

    it('(initial) -> /a', async () => {
      await router.setRoutes([{ path: '/a', action: elementWithAllLifecycleCallbacks('a') }], true);

      await router.render('/').catch(() => {});
      callbacksLog = [];
      await router.render('/a');

      verifyCallbacks(['a.action', 'a.onBeforeEnter', 'a.connectedCallback', 'a.onAfterEnter']);
    });

    it('/a -> /b', async () => {
      await router.setRoutes(
        [
          { path: '/a', action: elementWithAllLifecycleCallbacks('a') },
          { path: '/b', action: elementWithAllLifecycleCallbacks('b') },
        ],
        true,
      );

      await router.render('/a');
      callbacksLog = [];
      await router.render('/b');

      verifyCallbacks([
        'b.action',
        'a.onBeforeLeave',
        'b.onBeforeEnter',
        'b.connectedCallback',
        'b.onAfterEnter',
        'a.onAfterLeave',
        'a.disconnectedCallback',
      ]);
    });

    it('(initial) -> /a/b', async () => {
      await router.setRoutes(
        [
          {
            path: '/a',
            action,
            children: [{ path: '/b', action: elementWithAllLifecycleCallbacks('b') }],
          },
        ],
        true,
      );

      await router.render('/').catch(() => {});
      callbacksLog = [];
      await router.render('/a/b');

      verifyCallbacks(['a.action', 'b.action', 'b.onBeforeEnter', 'b.connectedCallback', 'b.onAfterEnter']);
    });

    it('/a/b -> /a/c', async () => {
      await router.setRoutes(
        [
          {
            path: '/a',
            action,
            children: [
              { path: '/b', action: elementWithAllLifecycleCallbacks('b') },
              { path: '/c', action: elementWithAllLifecycleCallbacks('c') },
            ],
          },
        ],
        true,
      );

      await router.render('/a/b');
      callbacksLog = [];
      await router.render('/a/c');

      verifyCallbacks([
        'a.action',
        'c.action',
        'b.onBeforeLeave',
        'c.onBeforeEnter',
        'c.connectedCallback',
        'c.onAfterEnter',
        'b.onAfterLeave',
        'b.disconnectedCallback',
      ]);
    });

    it('(initial) -> /a/non-existent-path', async () => {
      await router.render('/').catch(() => {});
      callbacksLog = [];

      // call 'setRoutes' without triggering a navigation event
      Resolver.prototype.setRoutes.call(router, [
        {
          path: '/a',
          action,
          children: [{ path: '/b', action: elementWithAllLifecycleCallbacks('b') }],
        },
        { path: '(.*)', action: elementWithAllLifecycleCallbacks('asterisk') },
      ]);
      await router.render('/a/non-existent-path');

      verifyCallbacks([
        'a.action',
        'asterisk.action',
        'asterisk.onBeforeEnter',
        'asterisk.connectedCallback',
        'asterisk.onAfterEnter',
      ]);
    });

    it('/a/b -> /a/non-existent-path', async () => {
      await router.setRoutes([
        {
          path: '/a',
          action,
          children: [{ path: '/b', action: elementWithAllLifecycleCallbacks('b') }],
        },
        { path: '(.*)', action: elementWithAllLifecycleCallbacks('asterisk') },
      ]);

      await router.render('/a/b');
      callbacksLog = [];
      await router.render('/a/non-existent-path');

      verifyCallbacks([
        'a.action',
        'asterisk.action',
        'b.onBeforeLeave',
        'asterisk.onBeforeEnter',
        'asterisk.connectedCallback',
        'asterisk.onAfterEnter',
        'b.onAfterLeave',
        'b.disconnectedCallback',
      ]);
    });

    it('/a/c -> /a/d (/a gets visited, but does not get matched)', async () => {
      await router.setRoutes(
        [
          {
            path: '/a',
            action,
            children: [
              {
                path: '/b',
                action() {
                  callbacksLog.push('b.action');
                  return undefined;
                },
                component: 'x-spy',
              },
            ],
          },
          { path: '/a/c', action: elementWithAllLifecycleCallbacks('ac') },
          { path: '/a/d', action: elementWithAllLifecycleCallbacks('ad') },
        ],
        true,
      );

      await router.render('/a/c');
      callbacksLog = [];
      await router.render('/a/d');

      verifyCallbacks([
        'a.action',
        'ad.action',
        'ac.onBeforeLeave',
        'ad.onBeforeEnter',
        'ad.connectedCallback',
        'ad.onAfterEnter',
        'ac.onAfterLeave',
        'ac.disconnectedCallback',
      ]);
    });

    it('/users/jane -> /users/john (when parameters are changed, all callbacks are called again)', async () => {
      await router.setRoutes([{ path: '/users/:user', action: elementWithUserParameter() }], true);

      await router.render('/users/jane');
      callbacksLog = [];
      await router.render('/users/john');

      verifyCallbacks([
        'x-user-john.action',
        'x-user-jane.onBeforeLeave',
        'x-user-john.onBeforeEnter',
        'x-user-john.connectedCallback',
        'x-user-john.onAfterEnter',
        'x-user-jane.onAfterLeave',
        'x-user-jane.disconnectedCallback',
      ]);
    });
  });

  describe('lifecycle events for nested routes', () => {
    const checkOutlet = (values: readonly string[]) =>
      checkOutletContents(outlet.children[0] as WebComponentInterface, 'name', values);

    beforeEach(async () => {
      await router.setRoutes(
        [
          { path: '/', component: 'div' },
          {
            path: '/a',
            action: elementWithAllLifecycleCallbacks('x-a'),
            children: [
              {
                path: '/b',
                action: elementWithAllLifecycleCallbacks('x-b'),
                children: [{ path: '/e', action: elementWithAllLifecycleCallbacks('x-e') }],
              },
              { path: '/d', action: elementWithAllLifecycleCallbacks('x-d') },
            ],
          },
          { path: '/c', action: elementWithAllLifecycleCallbacks('x-c') },
        ],
        true,
      );
      callbacksLog = [];
    });

    it('/a/b -> /a/b', async () => {
      await router.render('/a/b');

      verifyCallbacks([
        'x-a.action',
        'x-b.action',
        'x-a.onBeforeEnter',
        'x-b.onBeforeEnter',
        'x-a.connectedCallback',
        'x-b.connectedCallback',
        'x-a.onAfterEnter',
        'x-b.onAfterEnter',
      ]);
      checkOutlet(['x-a', 'x-b']);

      callbacksLog = [];
      await router.render('/a/b');

      verifyCallbacks([
        'x-a.action',
        'x-b.action',
        'x-b.onBeforeLeave',
        'x-a.onBeforeLeave',
        'x-a.onBeforeEnter',
        'x-b.onBeforeEnter',
      ]);
      checkOutlet(['x-a', 'x-b']);
    });

    it('/a/b -> /c', async () => {
      await router.render('/a/b');

      verifyCallbacks([
        'x-a.action',
        'x-b.action',
        'x-a.onBeforeEnter',
        'x-b.onBeforeEnter',
        'x-a.connectedCallback',
        'x-b.connectedCallback',
        'x-a.onAfterEnter',
        'x-b.onAfterEnter',
      ]);
      checkOutlet(['x-a', 'x-b']);

      callbacksLog = [];
      await router.render('/c');

      verifyCallbacks([
        'x-c.action',
        'x-b.onBeforeLeave',
        'x-a.onBeforeLeave',
        'x-c.onBeforeEnter',
        'x-c.connectedCallback',
        'x-c.onAfterEnter',
        'x-b.onAfterLeave',
        'x-a.onAfterLeave',
        'x-b.disconnectedCallback',
        'x-a.disconnectedCallback',
      ]);
      checkOutlet(['x-c']);
    });

    it('/a/b -> /a/d', async () => {
      await router.render('/a/b');

      verifyCallbacks([
        'x-a.action',
        'x-b.action',
        'x-a.onBeforeEnter',
        'x-b.onBeforeEnter',
        'x-a.connectedCallback',
        'x-b.connectedCallback',
        'x-a.onAfterEnter',
        'x-b.onAfterEnter',
      ]);
      checkOutlet(['x-a', 'x-b']);

      callbacksLog = [];
      await router.render('/a/d');

      verifyCallbacks([
        'x-a.action',
        'x-d.action',
        'x-b.onBeforeLeave',
        'x-d.onBeforeEnter',
        'x-d.connectedCallback',
        'x-d.onAfterEnter',
        'x-b.onAfterLeave',
        'x-b.disconnectedCallback',
      ]);
      checkOutlet(['x-a', 'x-d']);
    });

    it('/a/b -> /a/b/e', async () => {
      await router.render('/a/b');

      verifyCallbacks([
        'x-a.action',
        'x-b.action',
        'x-a.onBeforeEnter',
        'x-b.onBeforeEnter',
        'x-a.connectedCallback',
        'x-b.connectedCallback',
        'x-a.onAfterEnter',
        'x-b.onAfterEnter',
      ]);
      checkOutlet(['x-a', 'x-b']);

      callbacksLog = [];
      await router.render('/a/b/e');

      verifyCallbacks([
        'x-a.action',
        'x-b.action',
        'x-e.action',
        'x-e.onBeforeEnter',
        'x-e.connectedCallback',
        'x-e.onAfterEnter',
      ]);
      checkOutlet(['x-a', 'x-b', 'x-e']);
    });

    it('/a/b -> /a/b/e with extra root path', async () => {
      await router.setRoutes(
        [
          {
            path: '/a',
            action: elementWithAllLifecycleCallbacks('x-a'),
            children: [
              {
                path: '/b',
                action: elementWithAllLifecycleCallbacks('x-b'),
                children: [
                  { path: '/', action: elementWithAllLifecycleCallbacks('x-b-root') },
                  { path: '/e', action: elementWithAllLifecycleCallbacks('x-e') },
                ],
              },
              { path: '/d', action: elementWithAllLifecycleCallbacks('x-d') },
            ],
          },
          { path: '/c', action: elementWithAllLifecycleCallbacks('x-c') },
        ],
        true,
      );

      callbacksLog = [];
      await router.render('/a/b');

      verifyCallbacks([
        'x-a.action',
        'x-b.action',
        'x-b-root.action',
        'x-a.onBeforeEnter',
        'x-b.onBeforeEnter',
        'x-b-root.onBeforeEnter',
        'x-a.connectedCallback',
        'x-b.connectedCallback',
        'x-b-root.connectedCallback',
        'x-a.onAfterEnter',
        'x-b.onAfterEnter',
        'x-b-root.onAfterEnter',
      ]);
      checkOutlet(['x-a', 'x-b', 'x-b-root']);

      callbacksLog = [];
      await router.render('/a/b/e');

      verifyCallbacks([
        'x-a.action',
        'x-b.action',
        'x-e.action',
        'x-b-root.onBeforeLeave',
        'x-e.onBeforeEnter',
        'x-e.connectedCallback',
        'x-e.onAfterEnter',
        'x-b-root.onAfterLeave',
        'x-b-root.disconnectedCallback',
      ]);
      checkOutlet(['x-a', 'x-b', 'x-e']);
    });

    it('/a/b/e -> /a/b', async () => {
      await router.render('/a/b/e');

      verifyCallbacks([
        'x-a.action',
        'x-b.action',
        'x-e.action',
        'x-a.onBeforeEnter',
        'x-b.onBeforeEnter',
        'x-e.onBeforeEnter',
        'x-a.connectedCallback',
        'x-b.connectedCallback',
        'x-e.connectedCallback',
        'x-a.onAfterEnter',
        'x-b.onAfterEnter',
        'x-e.onAfterEnter',
      ]);
      checkOutlet(['x-a', 'x-b', 'x-e']);

      callbacksLog = [];
      await router.render('/a/b');

      verifyCallbacks([
        'x-a.action',
        'x-b.action',
        'x-e.onBeforeLeave',
        'x-e.onAfterLeave',
        'x-e.disconnectedCallback',
      ]);
      checkOutlet(['x-a', 'x-b']);
    });

    it('/a/b/e -> /a/b with extra root path', async () => {
      await router.setRoutes(
        [
          {
            path: '/a',
            action: elementWithAllLifecycleCallbacks('x-a'),
            children: [
              {
                path: '/b',
                action: elementWithAllLifecycleCallbacks('x-b'),
                children: [
                  { path: '/', action: elementWithAllLifecycleCallbacks('x-b-root') },
                  { path: '/e', action: elementWithAllLifecycleCallbacks('x-e') },
                ],
              },
              { path: '/d', action: elementWithAllLifecycleCallbacks('x-d') },
            ],
          },
          { path: '/c', action: elementWithAllLifecycleCallbacks('x-c') },
        ],
        true,
      );

      callbacksLog = [];
      await router.render('/a/b/e');

      verifyCallbacks([
        'x-a.action',
        'x-b.action',
        'x-e.action',
        'x-a.onBeforeEnter',
        'x-b.onBeforeEnter',
        'x-e.onBeforeEnter',
        'x-a.connectedCallback',
        'x-b.connectedCallback',
        'x-e.connectedCallback',
        'x-a.onAfterEnter',
        'x-b.onAfterEnter',
        'x-e.onAfterEnter',
      ]);
      checkOutlet(['x-a', 'x-b', 'x-e']);

      callbacksLog = [];
      await router.render('/a/b');

      verifyCallbacks([
        'x-a.action',
        'x-b.action',
        'x-b-root.action',
        'x-e.onBeforeLeave',
        'x-b-root.onBeforeEnter',
        'x-b-root.connectedCallback',
        'x-b-root.onAfterEnter',
        'x-e.onAfterLeave',
        'x-e.disconnectedCallback',
      ]);
      checkOutlet(['x-a', 'x-b', 'x-b-root']);
    });

    it('lifecycle events work for routes added via children function', async () => {
      await router.setRoutes(
        [
          {
            path: '/a',
            component: 'x-a',
            children: () => [{ path: '/b', action: elementWithAllLifecycleCallbacks('x-b') }],
          },
          { path: '/c', component: 'x-c' },
        ],
        true,
      );

      callbacksLog = [];
      await router.render('/a/b');

      verifyCallbacks(['x-b.action', 'x-b.onBeforeEnter', 'x-b.connectedCallback', 'x-b.onAfterEnter']);

      callbacksLog = [];
      await router.render('/c');

      verifyCallbacks(['x-b.onBeforeLeave', 'x-b.onAfterLeave', 'x-b.disconnectedCallback']);
    });

    it('/users/jane/edit -> /users/john/edit (when parameters changed, callbacks for nested routes are called)', async () => {
      await router.setRoutes(
        [
          {
            path: '/users',
            action: elementWithAllLifecycleCallbacks('x-users'),
            children: [
              {
                path: '/:user',
                action: elementWithUserParameter(),
                children: [{ path: '/edit', action: elementWithAllLifecycleCallbacks('x-user-edit') }],
              },
            ],
          },
        ],
        true,
      );

      await router.render('/users/jane/edit');
      verifyCallbacks([
        'x-users.action',
        'x-user-jane.action',
        'x-user-edit.action',
        'x-users.onBeforeEnter',
        'x-user-jane.onBeforeEnter',
        'x-user-edit.onBeforeEnter',
        'x-users.connectedCallback',
        'x-user-jane.connectedCallback',
        'x-user-edit.connectedCallback',
        'x-users.onAfterEnter',
        'x-user-jane.onAfterEnter',
        'x-user-edit.onAfterEnter',
      ]);

      callbacksLog = [];
      await router.render('/users/john/edit');

      verifyCallbacks([
        'x-users.action',
        'x-user-john.action',
        'x-user-edit.action',
        'x-user-edit.onBeforeLeave',
        'x-user-jane.onBeforeLeave',
        'x-user-john.onBeforeEnter',
        'x-user-edit.onBeforeEnter',
        'x-user-john.connectedCallback',
        'x-user-edit.connectedCallback',
        'x-user-john.onAfterEnter',
        'x-user-edit.onAfterEnter',
        'x-user-edit.onAfterLeave',
        'x-user-jane.onAfterLeave',
        'x-user-edit.disconnectedCallback',
        'x-user-jane.disconnectedCallback',
      ]);
    });
  });

  describe('lifecycle events with action', () => {
    it('lifecycle events when reusing element (#355)', async () => {
      const view = document.createElement('x-spy');
      view.name = 'foo';

      await router.setRoutes(
        [
          {
            path: '/([ab])',
            action: (ctx) => {
              callbacksLog.push(`${view.name}.action`);
              const content = document.createElement('div');
              content.textContent = ctx.pathname;
              view.appendChild(content);
              // Returns always the same view
              return view;
            },
          },
        ],
        true,
      );

      await router.render('/a');

      const cmp = outlet.children[0] as WebComponentInterface;

      expect(cmp).to.be.equal(view);
      expect(cmp.children.length).to.be.equal(1);
      expect(cmp.location?.pathname).to.be.equal('/a');
      expect(router.location.pathname).to.be.equal('/a');

      await router.render('/b');
      // Should reuse the same view
      expect(cmp).to.be.equal(view);
      // Should not modify the view content
      expect(cmp.children.length).to.be.equal(2);
      // Should update locations
      expect(cmp.location?.pathname).to.be.equal('/b');
      expect(router.location.pathname).to.be.equal('/b');

      // See #355
      verifyCallbacks([
        'foo.action',
        'foo.onBeforeEnter',
        'foo.connectedCallback',
        'foo.onAfterEnter',
        // always call action
        'foo.action',
        'foo.onBeforeLeave',
        'foo.onBeforeEnter',
        // stop calling any other callbacks if result is the same
        // stop detaching/re-attaching the element
      ]);
    });

    it('lifecycle events when changing first segment', async () => {
      const view = document.createElement('x-spy');
      view.name = 'foo';
      const userView = document.createElement('x-spy');
      userView.name = 'x-user';
      await router.setRoutes(
        {
          path: '/users/:id',
          action: () => {
            callbacksLog.push(`${userView.name}.action`);
            return userView;
          },
          children: [
            {
              path: 'edit',
              action: elementWithAllLifecycleCallbacks('x-edit'),
            },
          ],
        },
        true,
      );
      callbacksLog = [];
      await router.render('/users/1/edit');
      expect(outlet.children[0]).to.be.equal(userView);
      expect(outlet.children[0].children.length).to.be.equal(1);

      await router.render('/users/2/edit');
      // Should reuse the same view
      expect(outlet.children[0]).to.be.equal(userView);

      verifyCallbacks([
        'x-user.action',
        'x-edit.action',
        'x-user.onBeforeEnter',
        'x-edit.onBeforeEnter',
        'x-user.connectedCallback',
        'x-edit.connectedCallback',
        'x-user.onAfterEnter',
        'x-edit.onAfterEnter',
        // always call action
        'x-user.action',
        'x-edit.action',
        // only call changed segment events
        'x-edit.onBeforeLeave',
        'x-user.onBeforeLeave',
        'x-user.onBeforeEnter',
        'x-edit.onBeforeEnter',
      ]);
    });

    it('lifecycle events when changing the last segment with parent layout', async () => {
      const view = document.createElement('x-spy');
      view.name = 'x-foo';
      await router.setRoutes(
        {
          path: '/',
          action: elementWithAllLifecycleCallbacks('x-layout'),
          children: [
            {
              path: '(.*)',
              action: (ctx) => {
                callbacksLog.push(`${view.name}.action`);
                const content = document.createElement('div');
                content.textContent = ctx.pathname;
                view.appendChild(content);
                // Returns always the same view
                return view;
              },
            },
          ],
        },
        true,
      );
      callbacksLog = [];
      await router.render('/b');
      expect(outlet.children[0].localName).to.be.equal('x-spy');
      expect(outlet.children[0].children[0]).to.be.equal(view);

      await router.render('/a');
      // Should reuse the same view
      expect(outlet.children[0].children[0]).to.be.equal(view);

      verifyCallbacks([
        'x-layout.action',
        'x-foo.action',
        'x-layout.onBeforeEnter',
        'x-foo.onBeforeEnter',
        'x-layout.connectedCallback',
        'x-foo.connectedCallback',
        'x-layout.onAfterEnter',
        'x-foo.onAfterEnter',
        // always call action
        'x-layout.action',
        'x-foo.action',
        'x-foo.onBeforeLeave',
        'x-layout.onBeforeLeave',
        'x-layout.onBeforeEnter',
        'x-foo.onBeforeEnter',
        // stop calling any other callbacks if result is the same
        // stop detaching/re-attaching the element
      ]);
    });

    it('lifecycle when reusing element in different chains', async () => {
      const view = document.createElement('x-spy');
      view.name = 'bar';
      const action = (_: RouteContext) => {
        callbacksLog.push(`${view.name}.action`);
        // add a new div in each call to check that content is not touched
        const content = document.createElement('div');
        view.appendChild(content);
        // Returns always the same view
        return view;
      };

      await router.setRoutes(
        [
          {
            path: '/1',
            component: 'foo1',
            children: [
              {
                path: '/2',
                component: 'foo2',
                children: [
                  {
                    path: '/a',
                    action,
                  },
                ],
              },
            ],
          },
          {
            path: '/3',
            component: 'bar1',
            children: [
              {
                path: '/4',
                component: 'bar2',
                children: [
                  {
                    path: '/b',
                    action,
                  },
                ],
              },
            ],
          },
        ],
        true,
      );

      await router.render('/1/2/a');
      expect(outlet.children[0].localName).to.be.equal('foo1');
      expect(outlet.children[0].children[0].localName).to.be.equal('foo2');
      expect(outlet.children[0].children[0].children[0]).to.be.equal(view);
      expect(outlet.children[0].children[0].children[0].children.length).to.be.equal(1);

      await router.render('/3/4/b');
      expect(outlet.children[0].localName).to.be.equal('bar1');
      expect(outlet.children[0].children[0].localName).to.be.equal('bar2');
      // Should reuse the same view
      expect(outlet.children[0].children[0].children[0]).to.be.equal(view);
      // Should not modify the view content
      expect(outlet.children[0].children[0].children[0].children.length).to.be.equal(2);

      verifyCallbacks([
        'bar.action',
        'bar.onBeforeEnter',
        'bar.connectedCallback',
        'bar.onAfterEnter',
        'bar.action',
        'bar.onBeforeLeave',
        'bar.onBeforeEnter',
        'bar.disconnectedCallback',
        'bar.connectedCallback',
        'bar.onAfterEnter',
        'bar.onAfterLeave',
      ]);
    });

    it('lifecycle events for dynamic chains', async () => {
      const view = document.createElement('x-spy');
      view.name = 'x-spy';

      const action = (ctx: RouteContext) => {
        callbacksLog.push(`${view.name}.action`);
        // add a new div in each call to check that content is not touched
        const content = document.createElement('div');
        content.textContent = ctx.pathname;
        view.appendChild(content);
        // Returns always the same view
        return view;
      };
      await router.setRoutes(
        [
          {
            path: '/users/:name/',
            action: (ctx) => document.createElement(`user-${String(ctx.params.name)}`),
            children: [
              { path: 'edit', action },
              { path: 'profile', action },
            ],
          },
        ],
        true,
      );

      await router.render('/users/bunny/profile');
      expect(outlet.children[0].localName).to.be.equal('user-bunny');
      expect(outlet.children[0].children[0]).to.be.equal(view);
      expect(outlet.children[0].children[0].children.length).to.be.equal(1);

      await router.render('/users/donald/edit');
      expect(outlet.children[0].localName).to.be.equal('user-donald');
      expect(outlet.children[0].children[0]).to.be.equal(view);
      expect(outlet.children[0].children[0].children.length).to.be.equal(2);

      verifyCallbacks([
        'x-spy.action',
        'x-spy.onBeforeEnter',
        'x-spy.connectedCallback',
        'x-spy.onAfterEnter',
        'x-spy.action',
        'x-spy.onBeforeLeave',
        'x-spy.onBeforeEnter',
        'x-spy.disconnectedCallback',
        'x-spy.connectedCallback',
        'x-spy.onAfterEnter',
        'x-spy.onAfterLeave',
      ]);
    });

    it('lifecycle events for the same route when not reusing element (#361)', async () => {
      const view1 = document.createElement('x-spy');
      view1.textContent = 'view1';
      view1.name = 'view1';

      const view2 = document.createElement('x-spy');
      view2.textContent = 'view2';
      view2.name = 'view2';

      let cont = 0;
      await router.setRoutes(
        [
          {
            path: '/a',
            action: (_: RouteContext) => {
              const view = cont % 2 ? view2 : view1;
              cont += 1;
              callbacksLog.push(`${view.name}.action`);
              const content = document.createElement('div');
              content.textContent = `content-${view.name}`;
              view.appendChild(content);
              return view;
            },
          },
        ],
        true,
      );

      await router.render('/a');
      expect(outlet.children[0]).to.be.equal(view1);
      expect(outlet.children[0].children.length).to.be.equal(1);
      expect(outlet.children[0].children[0].textContent).to.be.equal('content-view1');

      await router.render('/a');
      expect(outlet.children[0]).to.be.equal(view2);
      expect(outlet.children[0].children.length).to.be.equal(1);
      expect(outlet.children[0].children[0].textContent).to.be.equal('content-view2');

      verifyCallbacks([
        'view1.action',
        'view1.onBeforeEnter',
        'view1.connectedCallback',
        'view1.onAfterEnter',
        'view2.action',
        'view1.onBeforeLeave',
        'view2.onBeforeEnter',
        'view2.connectedCallback',
        'view2.onAfterEnter',
        'view1.onAfterLeave',
        'view1.disconnectedCallback',
      ]);
    });

    it('Make lifecycle callbacks when reusing element for same path (#362, #311, #331)', async () => {
      const view = document.createElement('x-spy');
      view.textContent = 'view';
      view.name = 'view';

      let cont = 0;
      await router.setRoutes(
        [
          {
            path: '/a',
            action: (_: RouteContext) => {
              callbacksLog.push(`${view.name}.action.${cont % 2}`);
              const content = document.createElement('div');
              content.textContent = `content-${view.name}-${cont % 2}`;
              cont += 1;
              view.appendChild(content);
              return view;
            },
          },
        ],
        true,
      );

      await router.render('/a');
      expect(outlet.children[0]).to.be.equal(view);
      expect(outlet.children[0].children.length).to.be.equal(1);
      expect(outlet.children[0].children[0].textContent).to.be.equal('content-view-0');

      await router.render('/a');
      expect(outlet.children[0]).to.be.equal(view);
      expect(outlet.children[0].children.length).to.be.equal(2); // #362
      expect(outlet.children[0].children[0].textContent).to.be.equal('content-view-0');
      expect(outlet.children[0].children[1].textContent).to.be.equal('content-view-1');

      verifyCallbacks([
        'view.action.0',
        'view.onBeforeEnter',
        'view.connectedCallback',
        'view.onAfterEnter',
        // Action is always called
        'view.action.1',
        'view.onBeforeLeave',
        'view.onBeforeEnter',
      ]);
    });

    it('do not reattach component for same path (#311, #331)', async () => {
      await router.setRoutes([{ path: '/a', component: 'x-spy' }], true);

      await router.render('/a');
      verifyCallbacks([
        // actions are not logged because using components
        'x-spy.onBeforeEnter',
        'x-spy.connectedCallback',
        'x-spy.onAfterEnter',
      ]);
      const [view] = outlet.children;

      callbacksLog = [];
      await router.render('/a');
      expect(outlet.children[0]).to.be.equal(view);

      // Skip detach/re-attach and notifications (#311 #331)
      verifyCallbacks(['x-spy.onBeforeLeave', 'x-spy.onBeforeEnter']);
    });

    it('should update previousContext when attach is skipped (#391)', async () => {
      const container = document.createElement('x-spy');
      const layout = document.createElement('div');

      await router.setRoutes(
        [
          {
            path: '/',
            action: () => layout,
            children: [
              {
                path: '(.*)',
                action: (ctx) => {
                  container.name = `${ctx.pathname}-container`;
                  callbacksLog.push(`${container.name}.action`);
                  return container;
                },
              },
            ],
          } satisfies Route,
        ],
        true,
      );

      callbacksLog = [];
      await router.render('/server1');
      verifyCallbacks([
        '/server1-container.action',
        '/server1-container.onBeforeEnter',
        '/server1-container.connectedCallback',
        '/server1-container.onAfterEnter',
      ]);

      callbacksLog = [];
      await router.render('/server2');
      verifyCallbacks([
        '/server2-container.action',
        '/server2-container.onBeforeLeave',
        '/server2-container.onBeforeEnter',
      ]);

      // This fails if previousContext is not updated (#391)
      callbacksLog = [];
      await router.render('/server1');
      verifyCallbacks([
        '/server1-container.action',
        '/server1-container.onBeforeLeave',
        '/server1-container.onBeforeEnter',
      ]);
    });

    it('should not remove layout contents when it is reused (#392)', async () => {
      // A reusable layout with some content
      const layout = document.createElement('span');
      const layoutContent = document.createElement('a');
      layoutContent.textContent = 'layout-link';
      layout.appendChild(layoutContent);

      // Two different reusable views for client and server routes
      const clientContainer = document.createElement('h1');
      clientContainer.textContent = 'client';
      const serverContainer = document.createElement('h2');
      serverContainer.textContent = 'server';

      await router.setRoutes(
        [
          {
            path: '/',
            action: () => layout,
            children: [
              {
                path: 'client',
                action: () => clientContainer,
              },
              {
                path: 'server',
                action: () => serverContainer,
              },
            ],
          },
        ],
        true,
      );

      await router.render('/server');
      expect(outlet.innerHTML.toLowerCase()).to.be.equal('<span><a>layout-link</a><h2>server</h2></span>');

      await router.render('/client');
      expect(outlet.innerHTML.toLowerCase()).to.be.equal('<span><a>layout-link</a><h1>client</h1></span>');
    });

    // https://github.com/vaadin/flow/issues/8081
    it('should keep lifecycle even when path remains same and search string remains empty', async () => {
      await router.setRoutes([{ path: '/a', component: 'x-spy' }], true);

      // Pathname only means empty search string
      await router.render('/a');
      const [view] = outlet.children;

      callbacksLog = [];

      // No search in context means empty search string
      await router.render({ pathname: '/a' });
      expect(outlet.children[0]).to.be.equal(view);

      verifyCallbacks(['x-spy.onBeforeLeave', 'x-spy.onBeforeEnter']);

      // Explicit empty search string
      await router.render({ pathname: '/a', search: '' });
      expect(outlet.children[0]).to.be.equal(view);

      // Search remains empty, stil lifecycle
      verifyCallbacks(['x-spy.onBeforeLeave', 'x-spy.onBeforeEnter', 'x-spy.onBeforeLeave', 'x-spy.onBeforeEnter']);
    });

    it('should call lifecycle when path remains same and search string changes', async () => {
      await router.setRoutes([{ path: '/a', component: 'x-spy' }], true);

      // Pathname only means empty search string
      await router.render('/a');
      const [view] = outlet.children;

      callbacksLog = [];
      await router.render({ pathname: '/a', search: '?foo=bar' });
      expect(outlet.children[0]).to.be.equal(view);

      // Search string changed, call short lifecycle without reattach
      verifyCallbacks(['x-spy.onBeforeLeave', 'x-spy.onBeforeEnter']);

      callbacksLog = [];
      await router.render({ pathname: '/a', search: '?foo=baz' });
      expect(outlet.children[0]).to.be.equal(view);

      // Search string changed again, call short lifecycle without reattach
      verifyCallbacks(['x-spy.onBeforeLeave', 'x-spy.onBeforeEnter']);
    });
  });

  describe('lifecycle events with async action', () => {
    it('should invoke lifecycle events after action promise resolves', async () => {
      await router.setRoutes(
        [
          { path: '/', component: 'x-home-view' },
          {
            path: '/x-spy',
            async action() {
              return await new Promise((resolve) => {
                setTimeout(() => {
                  callbacksLog.push('action.promise');
                  resolve(undefined);
                }, 100);
              });
            },
            component: 'x-spy',
          },
        ],
        true,
      );

      await router.render('/');
      callbacksLog = [];
      await router.render('/x-spy');

      verifyCallbacks(['action.promise', 'x-spy.onBeforeEnter', 'x-spy.connectedCallback', 'x-spy.onAfterEnter']);
    });

    async function registerSpyComponentAsync(tagname: string, name: string, delayms: number): Promise<void> {
      return await new Promise((resolve) => {
        setTimeout(() => {
          callbacksLog.push(`${name}.define`);
          window.customElements.define(
            tagname,
            class extends XSpy {
              constructor() {
                super();
                this.name = name;
              }
            },
          );
          resolve();
        }, delayms);
      });
    }

    it('should invoke lifecycle events for dynamically imported routes sequentially', async () => {
      const unique = Math.floor(Math.random() * 100000);
      const parentTagname = `x-parent-layout-${unique}`;
      const childTagname = `x-child-${unique}`;

      await router.setRoutes(
        [
          {
            path: '/a',
            component: parentTagname,
            async action() {
              callbacksLog.push(`x-parent-layout.action`);
              await registerSpyComponentAsync(parentTagname, 'x-parent-layout', 30);
              return undefined;
            },
            children: [
              {
                path: '/b',
                component: childTagname,
                async action() {
                  callbacksLog.push(`x-child.action`);
                  await registerSpyComponentAsync(childTagname, 'x-child', 30);
                  return undefined;
                },
              },
            ],
          },
        ],
        true,
      );

      await router.render('/a/b');

      verifyCallbacks([
        `x-parent-layout.action`,
        `x-parent-layout.define`,
        `x-child.action`,
        `x-child.define`,
        `x-parent-layout.onBeforeEnter`,
        `x-child.onBeforeEnter`,
        `x-parent-layout.connectedCallback`,
        `x-child.connectedCallback`,
        `x-parent-layout.onAfterEnter`,
        `x-child.onAfterEnter`,
      ]);
    });
  });

  describe('the global `vaadin-router-location-changed` event', () => {
    it('should be triggered after a completed navigation', async () => {
      await router.setRoutes([{ path: '/', component: 'x-home-view' }], true);

      const onRouteChanged = sinon.spy();
      window.addEventListener('vaadin-router-location-changed', onRouteChanged);
      await router.render('/');
      window.removeEventListener('vaadin-router-location-changed', onRouteChanged);

      expect(onRouteChanged).to.have.been.calledOnce;
    });

    it('should NOT be triggered after an abandoned navigation', async () => {
      await router.setRoutes(
        [
          { path: '/', component: 'x-home-view' },
          { path: '/admin', component: 'x-admin-view' },
        ],
        true,
      );

      const onRouteChanged = sinon.spy();
      window.addEventListener('vaadin-router-location-changed', onRouteChanged);
      await Promise.all([router.render('/'), router.render('/admin')]);
      window.removeEventListener('vaadin-router-location-changed', onRouteChanged);

      expect(onRouteChanged).to.have.been.calledOnce;
    });

    it('should contain the new location as `event.detail.location`', async () => {
      await router.setRoutes([{ path: '/admin', component: 'x-admin-view' }], true);

      const onRouteChanged = sinon.spy();
      window.addEventListener('vaadin-router-location-changed', onRouteChanged);
      await router.render('/admin');
      window.removeEventListener('vaadin-router-location-changed', onRouteChanged);

      expect(onRouteChanged).to.have.been.calledOnce;
      expect(onRouteChanged.firstCall.args.length).to.equal(1);

      const event: VaadinRouterLocationChangedEvent = onRouteChanged.firstCall.firstArg;
      expect(event.detail.location).to.equal(router.location);
    });

    it('should contain the router instance as `event.detail.router`', async () => {
      await router.setRoutes([{ path: '/admin', component: 'x-admin-view' }], true);

      const onRouteChanged = sinon.spy();
      window.addEventListener('vaadin-router-location-changed', onRouteChanged);
      await router.render('/admin');
      window.removeEventListener('vaadin-router-location-changed', onRouteChanged);

      expect(onRouteChanged).to.have.been.calledOnce;
      expect(onRouteChanged.firstCall.args.length).to.equal(1);

      const event: VaadinRouterLocationChangedEvent = onRouteChanged.firstCall.firstArg;
      expect(event.detail.router).to.equal(router);
    });

    it('should be triggered after location update', async () => {
      await router.setRoutes([{ path: '/admin', component: 'x-admin-view' }], true);
      let pathname;
      const checkLocation = () => {
        expect(router).to.have.nested.property('location.pathname', '/admin');
        ({ pathname } = window.location);
      };
      window.addEventListener('vaadin-router-location-changed', checkLocation);
      await router.render('/admin', true);
      window.removeEventListener('vaadin-router-location-changed', checkLocation);

      expect(pathname).to.equal('/admin');
    });
  });

  describe('the global `vaadin-router-error` event', () => {
    it('should be triggered after a failed navigation', async () => {
      await router.setRoutes([{ path: '/', component: 'x-home-view' }], true);

      const onError = sinon.spy();
      window.addEventListener('vaadin-router-error', onError);
      await router.render('/non-existent').catch(() => {});
      window.removeEventListener('vaadin-router-error', onError);

      expect(onError).to.have.been.calledOnce;
    });

    it('should NOT be triggered after an abandoned navigation', async () => {
      await router.setRoutes([{ path: '/', component: 'x-home-view' }], true);

      const onError = sinon.spy();
      window.addEventListener('vaadin-router-error', onError);
      await Promise.all([
        router.render('/non-existent-1').catch(() => {}),
        router.render('/non-existent-2').catch(() => {}),
      ]);
      window.removeEventListener('vaadin-router-error', onError);

      expect(onError).to.have.been.calledOnce;
    });

    it('should contain the error as `event.detail.error`', async () => {
      await router.setRoutes([{ path: '/', component: 'x-home-view' }], true);

      const onError = sinon.spy();
      window.addEventListener('vaadin-router-error', onError);
      await router.render('/non-existent').catch(() => {});
      window.removeEventListener('vaadin-router-error', onError);

      expect(onError).to.have.been.calledOnce;
      expect(onError.firstCall.args.length).to.equal(1);

      const event: VaadinRouterErrorEvent = onError.firstCall.firstArg;
      expect(event.detail.error).to.be.an('error');
      expect(event.detail.error.context.pathname).to.equal('/non-existent');
    });

    it('should contain the router instance as `event.detail.router`', async () => {
      await router.setRoutes([{ path: '/', component: 'x-home-view' }], true);

      const onError = sinon.spy();
      window.addEventListener('vaadin-router-error', onError);
      await router.render('/non-existent').catch(() => {});
      window.removeEventListener('vaadin-router-error', onError);

      expect(onError).to.have.been.calledOnce;
      expect(onError.firstCall.args.length).to.equal(1);

      const event: VaadinRouterErrorEvent = onError.firstCall.firstArg;
      expect(event.detail.router).to.equal(router);
    });

    it('should contain the failed pathname as `event.detail.pathname`', async () => {
      await router.setRoutes([{ path: '/', component: 'x-home-view' }], true);

      const onError = sinon.spy();
      window.addEventListener('vaadin-router-error', onError);
      await router.render('/non-existent').catch(() => {});
      window.removeEventListener('vaadin-router-error', onError);

      expect(onError).to.have.been.calledOnce;
      expect(onError.firstCall.args.length).to.equal(1);

      const event: VaadinRouterErrorEvent = onError.firstCall.firstArg;
      expect(event.detail.pathname).to.equal('/non-existent');
    });
  });

  describe('Simultaneous renders', () => {
    const PAUSE_TIME = 100; // in ms

    const elementWithAction = (elementName: string) => {
      callbacksLog.push(`${elementName}.action`);
      const el = document.createElement('x-spy');
      el.name = elementName;
      return el;
    };
    const elementWithSlowBeforeEnter = (elementName: string) => (context: RouteContext) => {
      const el = elementWithAction(`${elementName}-render-${context.__renderId}`);
      el.onBeforeEnter = async () => {
        callbacksLog.push(`${el.name}.onBeforeEnter`);
        await sleep(PAUSE_TIME);
        return undefined;
      };
      return el;
    };
    const elementWithSlowBeforeLeave = (elementName: string) => (context: RouteContext) => {
      const el = elementWithAction(`${elementName}-render-${context.__renderId}`);
      el.onBeforeLeave = async () => {
        callbacksLog.push(`${el.name}.onBeforeLeave`);
        await sleep(PAUSE_TIME);
      };
      return el;
    };

    const elementWithRenderId = (elementName: string) => (context: RouteContext) =>
      elementWithAction(`${elementName}-render-${context.__renderId}`);

    it('should only run action when it is the last render', async () => {
      await router.setRoutes(
        [
          {
            path: '/',
            async action(context: RouteContext) {
              const el = elementWithAction(`x-parent-layout-render-${context.__renderId}`);
              await sleep(PAUSE_TIME);
              return el;
            },
            children: [
              {
                path: 'a',
                action: (context: RouteContext) => elementWithAction(`x-a-render-${context.__renderId}`),
              },
              {
                path: 'b',
                action: (context: RouteContext) => elementWithAction(`x-b-render-${context.__renderId}`),
              },
            ],
          },
        ],
        true,
      );
      callbacksLog = [];
      // eslint-disable-next-line no-void
      void router.render('/a');
      // render another path just before it runs action of `a`
      await sleep(PAUSE_TIME * 0.9);
      await router.render('/b');

      verifyCallbacks([
        'x-parent-layout-render-1.action',
        'x-parent-layout-render-2.action',
        'x-b-render-2.action',
        'x-parent-layout-render-2.onBeforeEnter',
        'x-b-render-2.onBeforeEnter',
        'x-parent-layout-render-2.connectedCallback',
        'x-b-render-2.connectedCallback',
        'x-parent-layout-render-2.onAfterEnter',
        'x-b-render-2.onAfterEnter',
      ]);
    });

    it('should only run onBeforeEnter events when it is the last render', async () => {
      await router.setRoutes(
        [
          {
            path: '/',
            action: elementWithSlowBeforeEnter('x-parent-layout'),
            children: [
              {
                path: 'a',
                action: elementWithSlowBeforeEnter('x-a'),
              },
              {
                path: 'b',
                action: elementWithSlowBeforeEnter('x-b'),
              },
            ],
          },
        ],
        true,
      );
      callbacksLog = [];
      // eslint-disable-next-line no-void
      void router.render('/a');
      // wait until the end of parent.onBeforeEnter
      // then trigger a new render
      // so that `x-a.onBeforeEnter` won't be executed
      await sleep(PAUSE_TIME * 0.9);
      await router.render('/b');
      await router.ready;
      verifyCallbacks([
        'x-parent-layout-render-1.action',
        'x-a-render-1.action',
        'x-parent-layout-render-1.onBeforeEnter',
        'x-parent-layout-render-2.action',
        'x-b-render-2.action',
        'x-parent-layout-render-2.onBeforeEnter',
        'x-b-render-2.onBeforeEnter',
        'x-parent-layout-render-2.connectedCallback',
        'x-b-render-2.connectedCallback',
        'x-parent-layout-render-2.onAfterEnter',
        'x-b-render-2.onAfterEnter',
      ]);
    });

    it('should stop running onBeforeEnter events immediately when there is a new render', async () => {
      await router.setRoutes(
        [
          {
            path: '/',
            action: elementWithSlowBeforeEnter('x-parent-layout'),
            children: [
              {
                path: 'a',
                action: elementWithSlowBeforeEnter('x-a'),
                children: [
                  {
                    path: 'a-child',
                    action: elementWithSlowBeforeEnter('x-a-child'),
                  },
                ],
              },
              {
                path: 'b',
                action: elementWithSlowBeforeEnter('x-b'),
              },
            ],
          },
        ],
        true,
      );
      callbacksLog = [];
      // eslint-disable-next-line no-void
      void router.render('/a/a-child');
      // give it enough time for running `parent.onBeforeEnter` and `x-a.onBeforeEnter`
      // then start a new render,
      // so `a-child.onBeforeEnter` shouldn't run at all
      await sleep(PAUSE_TIME * 1.5);
      await router.render('/b');
      verifyCallbacks([
        'x-parent-layout-render-1.action',
        'x-a-render-1.action',
        'x-a-child-render-1.action',
        'x-parent-layout-render-1.onBeforeEnter',
        'x-a-render-1.onBeforeEnter',
        'x-parent-layout-render-2.action',
        'x-b-render-2.action',
        'x-parent-layout-render-2.onBeforeEnter',
        'x-b-render-2.onBeforeEnter',
        'x-parent-layout-render-2.connectedCallback',
        'x-b-render-2.connectedCallback',
        'x-parent-layout-render-2.onAfterEnter',
        'x-b-render-2.onAfterEnter',
      ]);
    });
    it('should only run onBeforeLeave events when it is the last render', async () => {
      await router.setRoutes(
        [
          {
            path: '/',
            action: elementWithSlowBeforeLeave('x-parent-layout'),
            children: [
              {
                path: 'a',
                action: elementWithSlowBeforeLeave('x-a'),
                children: [
                  {
                    path: 'a-child',
                    action: elementWithSlowBeforeLeave('x-a-child'),
                  },
                ],
              },
              {
                path: 'b',
                action: elementWithSlowBeforeLeave('x-b'),
              },
            ],
          },
        ],
        true,
      );
      // eslint-disable-next-line no-void
      await router.render('/a/a-child');
      callbacksLog = [];
      // eslint-disable-next-line no-void
      void router.render('/b');
      await sleep(PAUSE_TIME * 0.9);
      await router.render('/a/a-child');
      verifyActiveRoutes(router, ['/', 'a', 'a-child']);
      verifyCallbacks([
        'x-parent-layout-render-2.action',
        'x-b-render-2.action',
        'x-a-child-render-1.onBeforeLeave',
        'x-parent-layout-render-3.action',
        'x-a-render-3.action',
        'x-a-child-render-3.action',
        'x-a-child-render-1.onBeforeLeave',
        'x-a-render-1.onBeforeLeave',
        'x-parent-layout-render-1.onBeforeLeave',
        'x-parent-layout-render-3.onBeforeEnter',
        'x-a-render-3.onBeforeEnter',
        'x-a-child-render-3.onBeforeEnter',
        'x-parent-layout-render-3.connectedCallback',
        'x-a-render-3.connectedCallback',
        'x-a-child-render-3.connectedCallback',
        'x-parent-layout-render-3.onAfterEnter',
        'x-a-render-3.onAfterEnter',
        'x-a-child-render-3.onAfterEnter',
        'x-a-child-render-1.onAfterLeave',
        'x-a-render-1.onAfterLeave',
        'x-parent-layout-render-1.onAfterLeave',
        'x-a-render-1.disconnectedCallback',
        'x-a-child-render-1.disconnectedCallback',
        'x-parent-layout-render-1.disconnectedCallback',
      ]);
    });

    it('should only run onAfterEnter/onAfterLeave events when it is the last render', async () => {
      await router.setRoutes(
        [
          {
            path: '/',
            action: elementWithRenderId('x-parent-layout'),
            children: [
              {
                path: 'a',
                action: elementWithRenderId('x-a'),
                children: [
                  {
                    path: 'a-child',
                    action: elementWithRenderId('x-a-child'),
                  },
                ],
              },
              {
                path: 'b',
                action: elementWithRenderId('x-b'),
              },
            ],
          },
        ],
        true,
      );

      const waitForLocationPromise = new Promise<void>((resolve, reject) => {
        const ctrl = new AbortController();
        // Attach a listener to `location-changed` event to trigger another render
        // because the event happens just before 'onAfterEnter'/'onAfterLeave'.
        window.addEventListener(
          'vaadin-router-location-changed',
          (event: VaadinRouterLocationChangedEvent) => {
            if (event.detail.location.pathname === '/b') {
              ctrl.abort();
              router
                .render('/a/a-child')
                .then(() => {
                  verifyActiveRoutes(router, ['/', 'a', 'a-child']);
                  verifyCallbacks([
                    'x-parent-layout-render-2.action',
                    'x-b-render-2.action',
                    'x-a-render-1.onBeforeLeave',
                    'x-parent-layout-render-1.onBeforeLeave',
                    'x-parent-layout-render-2.onBeforeEnter',
                    'x-b-render-2.onBeforeEnter',
                    'x-parent-layout-render-2.connectedCallback',
                    'x-b-render-2.connectedCallback',
                    // x-b-render-2.onAfterEnter is not executed here
                    // because the 3rd render already started
                    'x-parent-layout-render-3.action',
                    'x-a-render-3.action',
                    'x-a-child-render-3.action',
                    'x-a-render-1.onBeforeLeave',
                    'x-parent-layout-render-1.onBeforeLeave',
                    'x-parent-layout-render-3.onBeforeEnter',
                    'x-a-render-3.onBeforeEnter',
                    'x-a-child-render-3.onBeforeEnter',
                    'x-parent-layout-render-2.disconnectedCallback',
                    'x-b-render-2.disconnectedCallback',
                    'x-parent-layout-render-3.connectedCallback',
                    'x-a-render-3.connectedCallback',
                    'x-a-child-render-3.connectedCallback',
                    'x-parent-layout-render-3.onAfterEnter',
                    'x-a-render-3.onAfterEnter',
                    'x-a-child-render-3.onAfterEnter',
                    'x-a-render-1.onAfterLeave',
                    'x-parent-layout-render-1.onAfterLeave',
                    'x-a-render-1.disconnectedCallback',
                    'x-parent-layout-render-1.disconnectedCallback',
                  ]);
                  resolve();
                })
                .catch((e: unknown) => {
                  reject(e);
                });
            }
          },
          { signal: ctrl.signal },
        );
      });

      await router.render('/a');
      callbacksLog = [];
      // eslint-disable-next-line no-void
      void router.render('/b');
      await waitForLocationPromise;
    });
  });
});
