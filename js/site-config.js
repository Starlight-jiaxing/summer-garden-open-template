// 修改这两个值来自定义站点名称与站主昵称。
window.SITE_CONFIG = { siteName: "My Garden", ownerName: "Your Name" };
document.addEventListener("DOMContentLoaded", () => {
  const { siteName, ownerName } = window.SITE_CONFIG;
  document.title = document.title.replaceAll("My Garden", siteName).replaceAll("Your Name", ownerName);
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walk.nextNode()) nodes.push(walk.currentNode);
  for (const node of nodes) {
    if (node.parentElement?.closest("script,style,textarea")) continue;
    node.nodeValue = node.nodeValue.replaceAll("My Garden", siteName).replaceAll("Your Name", ownerName);
  }
});
