/** Mọi node trong một cây Block, kể cả con của con. */
function moiNode(nodes, ra) {
  (nodes || []).forEach((n) => {
    if (!n || !n.role) { return; }
    ra.push(n);
    if (Array.isArray(n.elements)) { moiNode(n.elements, ra); }
  });
  return ra;
}

module.exports = { moiNode };
