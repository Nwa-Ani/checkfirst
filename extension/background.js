// Adds right-click entries. Opening the result page passes only what the user chose to check.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'link', title: 'Check this link with CheckFirst', contexts: ['link'] });
  chrome.contextMenus.create({ id: 'selection', title: 'Check this text with CheckFirst', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'page', title: 'Check this page with CheckFirst', contexts: ['page'] });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const input = info.menuItemId === 'link' ? info.linkUrl
    : info.menuItemId === 'selection' ? info.selectionText
    : `${tab?.title || ''}\n${info.pageUrl}`;
  await chrome.storage.session.set({ pending: { input, kind: info.menuItemId, at: Date.now() } });
  chrome.windows.create({ url: chrome.runtime.getURL('result.html?from=menu'), type: 'popup', width: 420, height: 560 });
});
