import { test, expect, Page, Route } from '@playwright/test';

/**
 * Comments panel: comments are fetched only after pressing "Load comments".
 * The whole backend is mocked (no real API, YouTube quota or network is used).
 */

const VIDEO_A = 'aaaaaaaaaaa';
const VIDEO_B = 'bbbbbbbbbbb';
const urlOf = (id: string) => `https://www.youtube.com/watch?v=${id}`;

interface Comment {
  id: string;
  author: string;
  authorAvatar: string;
  authorChannelUrl: string;
  text: string;
  likeCount: number;
  publishedAt: string;
  replyCount: number;
}

interface Page_ {
  comments: Comment[];
  nextPageToken: string | null;
  disabled?: boolean;
}

function makeComment(id: string, text: string, replyCount = 0, publishedAt = '2024-01-01T00:00:00Z'): Comment {
  return { id, author: `author-${id}`, authorAvatar: '', authorChannelUrl: '', text, likeCount: 0, publishedAt, replyCount };
}

/** Deterministic page: 2 comments per page, the first page points to PAGE2. */
function defaultCommentsPage(videoId: string, order: string, pageToken: string | null): Page_ {
  const page = pageToken === 'PAGE2' ? 2 : 1;
  return {
    comments: [1, 2].map(i => makeComment(`${videoId}-${order}-${page}-${i}`, `${videoId} ${order} p${page} #${i}`)),
    nextPageToken: page === 1 ? 'PAGE2' : null
  };
}

type Handler = (url: URL, route: Route) => Promise<void> | void;

interface Mock {
  /** Every request to /api/comments* in order (path + query). */
  commentRequests: URL[];
  /** Requests to /api/* nobody mocked (must stay empty). */
  unmockedApi: string[];
  /** Replaces the /api/comments handler (the default serves defaultCommentsPage). */
  onComments: (handler: Handler) => void;
  onReplies: (handler: Handler) => void;
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function installMocks(page: Page): Promise<Mock> {
  const mock: Mock = {
    commentRequests: [],
    unmockedApi: [],
    onComments: h => (commentsHandler = h),
    onReplies: h => (repliesHandler = h)
  };

  let commentsHandler: Handler = (url, route) =>
    json(route, defaultCommentsPage(url.searchParams.get('videoId')!, url.searchParams.get('order')!, url.searchParams.get('pageToken')));
  let repliesHandler: Handler = (url, route) => {
    const parent = url.searchParams.get('parentId')!;
    // Like YouTube, replies come newest first.
    return json(route, {
      comments: [
        makeComment(`${parent}.r2`, `reply two of ${parent}`, 0, '2024-01-03T00:00:00Z'),
        makeComment(`${parent}.r1`, `reply one of ${parent}`, 0, '2024-01-02T00:00:00Z')
      ],
      nextPageToken: null
    });
  };

  // Anything that leaves the machine (YouTube iframe, fonts, avatars...) is blocked, except video metadata.
  await page.route(u => !['localhost', '127.0.0.1'].includes(u.hostname), route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'noembed.com') {
      return json(route, { title: 'Fake video', author_name: 'Fake channel', author_url: 'https://example.com/c' });
    }
    return route.abort();
  });

  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/config') return json(route, { serviceWorker: false });
    if (url.pathname === '/api/comments/replies') return repliesHandler(url, route);
    if (url.pathname === '/api/comments') return commentsHandler(url, route);
    mock.unmockedApi.push(`${route.request().method()} ${url.pathname}${url.search}`);
    return json(route, { error: 'not mocked' }, 404);
  });

  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api/comments')) mock.commentRequests.push(url);
  });

  return mock;
}

/** Waits for Angular to be settled after an action that must NOT trigger anything. */
const settle = (page: Page) => page.waitForTimeout(300);

test.describe('Comments panel (on-demand loading)', () => {
  // The desktop layout is pinned to the viewport height: with 720px the notes/comments row has 0px of height.
  test.use({ viewport: { width: 1440, height: 1200 } });

  let mock: Mock;
  let comments: ReturnType<Page['locator']>;
  let loadButton: ReturnType<Page['locator']>;

  test.beforeEach(async ({ page }) => {
    mock = await installMocks(page);
    comments = page.locator('app-comments');
    loadButton = comments.getByRole('button', { name: 'Load comments' });
  });

  test.afterEach(() => {
    expect(mock.unmockedApi, 'unexpected un-mocked /api calls').toEqual([]);
  });

  const openVideo = async (page: Page, id = VIDEO_A) => {
    await page.goto(`/watch?v=${id}`);
    await expect(comments).toBeVisible();
  };

  const switchToVideo = async (page: Page, id: string) => {
    const input = page.getByPlaceholder('Paste a YouTube link or search videos...');
    await input.click(); // a real click: Chrome skips history entries pushed without user activation on Back
    await input.fill(urlOf(id));
    await expect(page).toHaveURL(new RegExp(`v=${id}`));
  };

  test('1. opening a video makes no comments request and shows "Load comments"', async ({ page }) => {
    await openVideo(page);
    await expect(loadButton).toBeVisible();
    await settle(page);
    expect(mock.commentRequests).toHaveLength(0);
    await expect(comments.getByText('author-')).toHaveCount(0);
  });

  test('2. before loading, Recent/Relevant make no requests and show no status messages', async ({ page }) => {
    await openVideo(page);

    await comments.getByRole('button', { name: 'Recent' }).click();
    await comments.getByRole('button', { name: 'Relevant' }).click();
    await comments.getByRole('button', { name: 'Recent' }).click();
    await settle(page);

    expect(mock.commentRequests).toHaveLength(0);
    await expect(loadButton).toBeVisible();
    for (const text of [/Cargando comentarios/, /turned off/, /no comments/, /Reintentar/, /Could not load/]) {
      await expect(comments.getByText(text)).toHaveCount(0);
    }
  });

  test('3. "Load comments" requests with the selected order; "Load more" sends pageToken', async ({ page }) => {
    await openVideo(page);

    // The order chosen before loading is the one that gets requested.
    await comments.getByRole('button', { name: 'Recent' }).click();
    await loadButton.click();

    await expect(comments.getByText(`${VIDEO_A} time p1 #1`)).toBeVisible();
    await expect(comments.getByText(`${VIDEO_A} time p1 #2`)).toBeVisible();
    await expect(loadButton).toHaveCount(0);
    expect(mock.commentRequests).toHaveLength(1);
    expect(Object.fromEntries(mock.commentRequests[0].searchParams)).toEqual({ videoId: VIDEO_A, order: 'time' });

    await comments.getByRole('button', { name: 'Load more' }).click();
    await expect(comments.getByText(`${VIDEO_A} time p2 #1`)).toBeVisible();
    expect(mock.commentRequests).toHaveLength(2);
    expect(Object.fromEntries(mock.commentRequests[1].searchParams)).toEqual({ videoId: VIDEO_A, order: 'time', pageToken: 'PAGE2' });

    // Page 1 stays, and the last page has no further "Load more".
    await expect(comments.getByText(`${VIDEO_A} time p1 #1`)).toBeVisible();
    await expect(comments.getByRole('button', { name: 'Load more' })).toHaveCount(0);
  });

  test('3b. default order is relevance', async ({ page }) => {
    await openVideo(page);
    await loadButton.click();
    await expect(comments.getByText(`${VIDEO_A} relevance p1 #1`)).toBeVisible();
    expect(mock.commentRequests.map(u => u.searchParams.get('order'))).toEqual(['relevance']);
  });

  test('4. after loading, changing the order reloads with the new order', async ({ page }) => {
    await openVideo(page);
    await loadButton.click();
    await expect(comments.getByText(`${VIDEO_A} relevance p1 #1`)).toBeVisible();
    // Move to page 2 so we can check the reload starts from the beginning.
    await comments.getByRole('button', { name: 'Load more' }).click();
    await expect(comments.getByText(`${VIDEO_A} relevance p2 #1`)).toBeVisible();

    await comments.getByRole('button', { name: 'Recent' }).click();
    await expect(comments.getByText(`${VIDEO_A} time p1 #1`)).toBeVisible();
    await expect(comments.getByText(/relevance/)).toHaveCount(0);

    const last = mock.commentRequests.at(-1)!;
    expect(Object.fromEntries(last.searchParams)).toEqual({ videoId: VIDEO_A, order: 'time' }); // no pageToken
    expect(mock.commentRequests).toHaveLength(3);

    // Pressing the order that is already active does not refetch.
    await comments.getByRole('button', { name: 'Recent' }).click();
    await settle(page);
    expect(mock.commentRequests).toHaveLength(3);

    await comments.getByRole('button', { name: 'Relevant' }).click();
    await expect(comments.getByText(`${VIDEO_A} relevance p1 #1`)).toBeVisible();
    expect(mock.commentRequests).toHaveLength(4);
  });

  test('5. switching video brings the button back without requests', async ({ page }) => {
    await openVideo(page);
    await loadButton.click();
    await expect(comments.getByText(`${VIDEO_A} relevance p1 #1`)).toBeVisible();
    expect(mock.commentRequests).toHaveLength(1);

    await switchToVideo(page, VIDEO_B);

    await expect(loadButton).toBeVisible();
    await expect(comments.getByText(VIDEO_A)).toHaveCount(0);
    await settle(page);
    expect(mock.commentRequests).toHaveLength(1);

    await loadButton.click();
    await expect(comments.getByText(`${VIDEO_B} relevance p1 #1`)).toBeVisible();
    expect(mock.commentRequests.at(-1)!.searchParams.get('videoId')).toBe(VIDEO_B);
  });

  test('5b. a slow response from the previous video is not painted (back on the button)', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    mock.onComments(async (url, route) => {
      const id = url.searchParams.get('videoId')!;
      if (id === VIDEO_A) await gate;
      await json(route, defaultCommentsPage(id, url.searchParams.get('order')!, url.searchParams.get('pageToken')));
    });

    await openVideo(page, VIDEO_A);
    await loadButton.click();
    await expect(comments.getByText('Cargando comentarios')).toBeVisible();
    expect(mock.commentRequests).toHaveLength(1);

    await switchToVideo(page, VIDEO_B);
    await expect(loadButton).toBeVisible();

    release(); // video A answers late
    await settle(page);

    await expect(comments.getByText(VIDEO_A)).toHaveCount(0);
    await expect(loadButton).toBeVisible();
    await expect(comments.getByText('Cargando comentarios')).toHaveCount(0);
    expect(mock.commentRequests).toHaveLength(1);
  });

  test('5c. a slow response from the previous video does not mix into the new video\'s comments', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    mock.onComments(async (url, route) => {
      const id = url.searchParams.get('videoId')!;
      if (id === VIDEO_A) await gate;
      await json(route, defaultCommentsPage(id, url.searchParams.get('order')!, url.searchParams.get('pageToken')));
    });

    await openVideo(page, VIDEO_A);
    await loadButton.click();
    await expect(comments.getByText('Cargando comentarios')).toBeVisible();

    await switchToVideo(page, VIDEO_B);
    await loadButton.click();
    await expect(comments.getByText(`${VIDEO_B} relevance p1 #1`)).toBeVisible();

    release(); // video A answers after B is already painted
    await settle(page);

    await expect(comments.getByText(VIDEO_A)).toHaveCount(0);
    await expect(comments.getByText(`${VIDEO_B} relevance p1 #1`)).toBeVisible();
    await expect(comments.getByText(`${VIDEO_B} relevance p1 #2`)).toBeVisible();
    await expect(comments.getByText('author-')).toHaveCount(2);
    // Not stuck in the "loading" state because of the discarded response.
    await expect(comments.getByText('Cargando comentarios')).toHaveCount(0);
  });

  test('6. an API error shows "Reintentar" and pressing it recovers', async ({ page }) => {
    let calls = 0;
    mock.onComments((url, route) => {
      calls++;
      if (calls === 1) return json(route, { error: 'YouTube exploded' }, 502);
      return json(route, defaultCommentsPage(VIDEO_A, url.searchParams.get('order')!, null));
    });

    await openVideo(page);
    await expect(comments.getByText('YouTube exploded')).toHaveCount(0); // nothing before the click
    await loadButton.click();

    await expect(comments.getByText('YouTube exploded')).toBeVisible();
    const retry = comments.getByRole('button', { name: 'Reintentar' });
    await expect(retry).toBeVisible();
    await expect(loadButton).toHaveCount(0);

    await retry.click();
    await expect(comments.getByText(`${VIDEO_A} relevance p1 #1`)).toBeVisible();
    await expect(comments.getByText('YouTube exploded')).toHaveCount(0);
    await expect(retry).toHaveCount(0);
    expect(mock.commentRequests).toHaveLength(2);
  });

  test('6b. an error without a body falls back to the generic message', async ({ page }) => {
    mock.onComments((_url, route) => route.fulfill({ status: 500, contentType: 'text/plain', body: 'oops' }));
    await openVideo(page);
    await loadButton.click();
    await expect(comments.getByText('Could not load the comments.')).toBeVisible();
    await expect(comments.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });

  test('7. disabled comments: the message appears only after pressing the button', async ({ page }) => {
    mock.onComments((_url, route) => json(route, { comments: [], nextPageToken: null, disabled: true }));

    await openVideo(page);
    await settle(page);
    await expect(comments.getByText('Comments are turned off for this video.')).toHaveCount(0);
    await expect(loadButton).toBeVisible();
    expect(mock.commentRequests).toHaveLength(0);

    await loadButton.click();
    await expect(comments.getByText('Comments are turned off for this video.')).toBeVisible();
    await expect(loadButton).toHaveCount(0);
    expect(mock.commentRequests).toHaveLength(1);

    // On another video the message is gone and the button is back.
    await switchToVideo(page, VIDEO_B);
    await expect(loadButton).toBeVisible();
    await expect(comments.getByText('Comments are turned off for this video.')).toHaveCount(0);
  });

  test('7b. a video without comments shows the empty message only after loading', async ({ page }) => {
    mock.onComments((_url, route) => json(route, { comments: [], nextPageToken: null }));
    await openVideo(page);
    await settle(page);
    await expect(comments.getByText('This video has no comments.')).toHaveCount(0);
    await loadButton.click();
    await expect(comments.getByText('This video has no comments.')).toBeVisible();
  });

  test('8. viewing the replies of a comment works', async ({ page }) => {
    mock.onComments((url, route) => json(route, {
      comments: [makeComment('c1', 'top level comment', 2), makeComment('c2', 'no replies here', 0)],
      nextPageToken: null
    }));

    await openVideo(page);
    await loadButton.click();
    await expect(comments.getByText('top level comment')).toBeVisible();

    // Only comments with replies get the toggle.
    await expect(comments.getByRole('button', { name: /respuestas?/ })).toHaveCount(1);
    await comments.getByRole('button', { name: 'Ver 2 respuestas' }).click();

    await expect(comments.getByText('reply one of c1')).toBeVisible();
    await expect(comments.getByText('reply two of c1')).toBeVisible();

    const repliesRequest = mock.commentRequests.find(u => u.pathname === '/api/comments/replies')!;
    expect(Object.fromEntries(repliesRequest.searchParams)).toEqual({ parentId: 'c1' });

    // Shown in conversation order (oldest first), even though the API returns newest first.
    const texts = await comments.locator('p.select-text').allTextContents();
    expect(texts).toEqual(['top level comment', 'reply one of c1', 'reply two of c1', 'no replies here']);

    // Hide and show again without a new request.
    await comments.getByRole('button', { name: 'Ocultar respuestas' }).click();
    await expect(comments.getByText('reply one of c1')).toHaveCount(0);
    await comments.getByRole('button', { name: 'Ver 2 respuestas' }).click();
    await expect(comments.getByText('reply one of c1')).toBeVisible();
    expect(mock.commentRequests.filter(u => u.pathname === '/api/comments/replies')).toHaveLength(1);
  });

  test('8b. replies and their open state are dropped when the order changes', async ({ page }) => {
    mock.onComments((url, route) => json(route, {
      comments: [makeComment(`c-${url.searchParams.get('order')}`, 'parent', 1)],
      nextPageToken: null
    }));
    await openVideo(page);
    await loadButton.click();
    await comments.getByRole('button', { name: 'Ver 1 respuesta' }).click();
    await expect(comments.getByText(/reply one of c-relevance/)).toBeVisible();

    await comments.getByRole('button', { name: 'Recent' }).click();
    await expect(comments.getByText(/reply one of c-relevance/)).toHaveCount(0);
    await expect(comments.getByRole('button', { name: 'Ver 1 respuesta' })).toBeVisible();
  });

  test('9. going back to the first video starts again from the button', async ({ page }) => {
    await openVideo(page, VIDEO_A);
    await loadButton.click();
    await expect(comments.getByText(`${VIDEO_A} relevance p1 #1`)).toBeVisible();

    await switchToVideo(page, VIDEO_B);
    await expect(loadButton).toBeVisible();
    await switchToVideo(page, VIDEO_A);
    await expect(loadButton).toBeVisible();
    await expect(comments.getByText('author-')).toHaveCount(0);
    await settle(page);
    expect(mock.commentRequests).toHaveLength(1);
  });

  test('10. browser back/forward between videos also resets to the button', async ({ page }) => {
    await openVideo(page, VIDEO_A);
    // Changing the player iframe's src adds its own joint-history entry (Back would first undo that one),
    // which is unrelated to comments: detach the iframe so Back goes straight to the previous URL.
    await page.evaluate(() => document.querySelector('iframe')?.remove());
    await switchToVideo(page, VIDEO_B);
    await loadButton.click();
    await expect(comments.getByText(`${VIDEO_B} relevance p1 #1`)).toBeVisible();

    // Same-document history entry (pushState): there is no page load to wait for.
    await page.evaluate(() => history.back());
    await expect(page).toHaveURL(new RegExp(`v=${VIDEO_A}`));
    await expect(loadButton).toBeVisible();
    await expect(comments.getByText('author-')).toHaveCount(0);
    expect(mock.commentRequests).toHaveLength(1);
  });
});
