import { buildPageView, buildSelfDescribingEvent, Payload, trackerCore } from '@snowplow/tracker-core';
import { setAppStorage } from '../../src/app_storage';
import { newSessionPlugin } from '../../src/plugins/session';

describe('Session plugin', () => {
  let storage: Record<string, string> = {};

  setAppStorage({
    getItem: (key: string) => Promise.resolve(storage[key] ?? null),
    setItem: (key: string, value: string) => {
      storage[key] = value;

      return Promise.resolve();
    },
  });

  beforeAll(() => {
    jest.useFakeTimers();
  });

  beforeEach(async () => {
    storage = {};
  });

  afterAll(() => {
    jest.clearAllTimers();
  });

  it('starts a new session when necessary', async () => {
    jest.setSystemTime(new Date('2022-04-17T00:00:00.000Z'));
    const sessionPlugin = await newSessionPlugin({
      namespace: 'test',
      foregroundSessionTimeout: 5,
      backgroundSessionTimeout: 5,
    });

    const sessionState = await sessionPlugin.getSessionState();
    expect(sessionState.sessionIndex).toBe(1);

    jest.setSystemTime(new Date('2022-04-17T00:00:10.000Z'));

    const tracker = trackerCore({ corePlugins: [sessionPlugin.plugin] });
    tracker.track(buildPageView({ pageUrl: 'http://localhost' }));

    const newSessionState = await sessionPlugin.getSessionState();
    expect(newSessionState.sessionIndex).toBe(2);
    expect(newSessionState.previousSessionId).toBe(sessionState.sessionId);
  });

  it('attaches session context to events with the correct properties', async () => {
    jest.setSystemTime(new Date('2022-04-17T00:00:00.000Z'));
    const sessionPlugin = await newSessionPlugin({
      namespace: 'test',
      foregroundSessionTimeout: 5,
      backgroundSessionTimeout: 5,
    });

    const payloads: Payload[] = [];
    const tracker = trackerCore({
      corePlugins: [sessionPlugin.plugin],
      callback: (pb) => payloads.push(pb.build()),
      base64: false,
    });

    tracker.track(buildPageView({ pageUrl: 'http://localhost' }));
    tracker.track(buildPageView({ pageUrl: 'http://localhost' }));

    expect(payloads.length).toBe(2);
    expect(JSON.parse(payloads[0]?.co as string).data).toEqual([
      {
        schema: 'iglu:com.snowplowanalytics.snowplow/client_session/jsonschema/1-0-2',
        data: {
          userId: await sessionPlugin.getSessionUserId(),
          sessionId: await sessionPlugin.getSessionId(),
          sessionIndex: 1,
          storageMechanism: 'LOCAL_STORAGE',
          eventIndex: 1,
          firstEventId: payloads[0]?.eid,
          firstEventTimestamp: '2022-04-17T00:00:00.000Z',
        },
      },
    ]);
    expect(JSON.parse(payloads[1]?.co as string).data).toEqual([
      {
        schema: 'iglu:com.snowplowanalytics.snowplow/client_session/jsonschema/1-0-2',
        data: {
          userId: await sessionPlugin.getSessionUserId(),
          sessionId: await sessionPlugin.getSessionId(),
          sessionIndex: 1,
          storageMechanism: 'LOCAL_STORAGE',
          eventIndex: 2,
          firstEventId: payloads[0]?.eid,
          firstEventTimestamp: '2022-04-17T00:00:00.000Z',
        },
      },
    ]);
  });

  it('creates a new session when new tracker is created', async () => {
    jest.setSystemTime(new Date('2022-04-17T00:00:00.000Z'));
    const sessionPlugin = await newSessionPlugin({
      namespace: 'test',
      foregroundSessionTimeout: 5,
      backgroundSessionTimeout: 5,
    });

    const tracker1 = trackerCore({ corePlugins: [sessionPlugin.plugin] });
    tracker1.track(buildPageView({ pageUrl: 'http://localhost' }));

    const sessionState = await sessionPlugin.getSessionState();
    expect(sessionState.sessionIndex).toBe(1);

    const sessionPlugin2 = await newSessionPlugin({
      namespace: 'test',
      foregroundSessionTimeout: 5,
      backgroundSessionTimeout: 5,
    });

    const newSessionState = await sessionPlugin2.getSessionState();
    expect(newSessionState.sessionIndex).toBe(2);
    expect(newSessionState.previousSessionId).toBe(sessionState.sessionId);
  });

  it('uses a background timeout when in background', async () => {
    jest.setSystemTime(new Date('2022-04-17T00:00:00.000Z'));
    const sessionPlugin = await newSessionPlugin({
      namespace: 'test',
      foregroundSessionTimeout: 1000,
      backgroundSessionTimeout: 5,
    });

    const tracker = trackerCore({ corePlugins: [sessionPlugin.plugin] });
    tracker.track(
      buildSelfDescribingEvent({
        event: {
          schema: 'iglu:com.snowplowanalytics.snowplow/application_background/jsonschema/1-0-0',
          data: {},
        },
      })
    );

    let sessionState = await sessionPlugin.getSessionState();
    expect(sessionState.sessionIndex).toBe(1);
    const firstSessionId = sessionState.sessionId;

    jest.setSystemTime(new Date('2022-04-17T00:00:05.000Z'));
    tracker.track(buildPageView({ pageUrl: 'http://localhost' }));
    sessionState = await sessionPlugin.getSessionState();
    expect(sessionState.sessionIndex).toBe(1);

    jest.setSystemTime(new Date('2022-04-17T00:00:15.000Z'));
    tracker.track(buildPageView({ pageUrl: 'http://localhost' }));

    sessionState = await sessionPlugin.getSessionState();
    expect(sessionState.sessionIndex).toBe(2);
    expect(sessionState.previousSessionId).toBe(firstSessionId);
  });

  it('uses a foreground timeout when in foreground', async () => {
    jest.setSystemTime(new Date('2022-04-17T00:00:00.000Z'));
    const sessionPlugin = await newSessionPlugin({
      namespace: 'test',
      foregroundSessionTimeout: 5,
      backgroundSessionTimeout: 1,
    });

    const tracker = trackerCore({ corePlugins: [sessionPlugin.plugin] });

    let sessionState = await sessionPlugin.getSessionState();
    expect(sessionState.sessionIndex).toBe(1);
    const firstSessionId = sessionState.sessionId;

    jest.setSystemTime(new Date('2022-04-17T00:00:02.000Z'));
    tracker.track(buildPageView({ pageUrl: 'http://localhost' }));
    expect(sessionState.sessionIndex).toBe(1);

    jest.setSystemTime(new Date('2022-04-17T00:00:10.000Z'));
    tracker.track(buildPageView({ pageUrl: 'http://localhost' }));
    sessionState = await sessionPlugin.getSessionState();
    expect(sessionState.sessionIndex).toBe(2);
    expect(sessionState.previousSessionId).toBe(firstSessionId);
  });

  it('has separate session state for different namespaces', async () => {
    jest.setSystemTime(new Date('2022-04-17T00:00:00.000Z'));
    const sessionPlugin1 = await newSessionPlugin({
      namespace: 'test1',
      foregroundSessionTimeout: 5,
      backgroundSessionTimeout: 5,
    });

    const sessionPlugin2 = await newSessionPlugin({
      namespace: 'test2',
      foregroundSessionTimeout: 5,
      backgroundSessionTimeout: 5,
    });

    const tracker1 = trackerCore({ corePlugins: [sessionPlugin1.plugin] });
    const tracker2 = trackerCore({ corePlugins: [sessionPlugin2.plugin] });

    tracker1.track(buildPageView({ pageUrl: 'http://localhost' }));
    tracker2.track(buildPageView({ pageUrl: 'http://localhost' }));

    const sessionState1 = await sessionPlugin1.getSessionState();
    const sessionState2 = await sessionPlugin2.getSessionState();

    expect(sessionState1.sessionIndex).toBe(1);
    expect(sessionState2.sessionIndex).toBe(1);
  });

  it('retrieves the correct information from the session plugin', async () => {
    jest.setSystemTime(new Date('2022-04-17T00:00:00.000Z'));
    const sessionPlugin = await newSessionPlugin({
      namespace: 'test',
      foregroundSessionTimeout: 5,
      backgroundSessionTimeout: 5,
    });

    const tracker = trackerCore({ corePlugins: [sessionPlugin.plugin] });
    tracker.track(buildPageView({ pageUrl: 'http://localhost' }));

    const userId = await sessionPlugin.getSessionUserId();
    const sessionId = await sessionPlugin.getSessionId();
    const sessionIndex = await sessionPlugin.getSessionIndex();
    const sessionState = await sessionPlugin.getSessionState();

    expect(userId).toBeDefined();
    expect(sessionId).toBeDefined();
    expect(sessionIndex).toBe(1);
    expect(sessionState.userId).toEqual(userId);
    expect(sessionState.sessionId).toEqual(sessionId);
    expect(sessionState.sessionIndex).toEqual(sessionIndex);
  });
});
