// 修改这两个值可替换页面中对应的站名与英文姓名；其他介绍和联系方式请编辑各页面。
window.SITE_CONFIG = { siteName: "JX Garden", ownerName: "Zhang Jiaxing" };
document.addEventListener("DOMContentLoaded", () => {
  const { siteName, ownerName } = window.SITE_CONFIG;
  const replaceNames = value => value.replaceAll("JX Garden", siteName).replaceAll("Zhang Jiaxing", ownerName);
  document.title = replaceNames(document.title);
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walk.nextNode()) nodes.push(walk.currentNode);
  for (const node of nodes) {
    if (node.parentElement?.closest("script,style,textarea")) continue;
    node.nodeValue = replaceNames(node.nodeValue);
  }
});
