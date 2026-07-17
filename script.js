const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

let products = [];
let transactions = [];
let cart = [];

const rupiah = value => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0
}).format(Number(value || 0));

const dateTime = value => new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short'
}).format(new Date(value));

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add('hidden'), 2800);
}

function setLoading(button, loading, text = 'Memproses...') {
  if (!button) return;
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = text;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

async function checkConfig() {
  if (
    SUPABASE_URL.includes('PASTE_') ||
    SUPABASE_PUBLISHABLE_KEY.includes('PASTE_')
  ) {
    document.getElementById('loginError').textContent =
      'Supabase belum dihubungkan. Isi file config.js terlebih dahulu.';
    document.getElementById('loginBtn').disabled = true;
    return false;
  }
  return true;
}

async function initializeApp() {
  if (!await checkConfig()) return;

  const { data: { session } } = await db.auth.getSession();
  toggleAuthView(Boolean(session));

  if (session) {
    await loadAllData();
  }
}

function toggleAuthView(isLoggedIn) {
  document.getElementById('loginScreen').classList.toggle('hidden', isLoggedIn);
  document.getElementById('appShell').classList.toggle('hidden', !isLoggedIn);
}

async function loadAllData() {
  try {
    await Promise.all([loadProducts(), loadTransactions()]);
    renderAll();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Gagal mengambil data dari database.');
  }
}

async function loadProducts() {
  const { data, error } = await db
    .from('products')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;

  products = (data || []).map(item => ({
    id: item.id,
    name: item.name,
    price: Number(item.price),
    stock: Number(item.stock)
  }));
}

async function loadTransactions() {
  const { data, error } = await db
    .from('transactions')
    .select(`
      id,
      code,
      total,
      created_at,
      transaction_items (
        id,
        product_name,
        price,
        quantity,
        subtotal
      )
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  transactions = (data || []).map(tx => ({
    id: tx.id,
    code: tx.code,
    total: Number(tx.total),
    createdAt: tx.created_at,
    items: (tx.transaction_items || []).map(item => ({
      name: item.product_name,
      price: Number(item.price),
      quantity: Number(item.quantity),
      subtotal: Number(item.subtotal)
    }))
  }));
}

document.getElementById('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('loginBtn');
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';
  setLoading(button, true, 'Masuk...');

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  const { error } = await db.auth.signInWithPassword({ email, password });

  setLoading(button, false);

  if (error) {
    errorEl.textContent = 'Email atau kata sandi salah.';
    return;
  }

  toggleAuthView(true);
  await loadAllData();
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await db.auth.signOut();
  products = [];
  transactions = [];
  cart = [];
  toggleAuthView(false);
});

db.auth.onAuthStateChange((_event, session) => {
  if (!session) toggleAuthView(false);
});

function goToPage(pageId) {
  document.querySelectorAll('.page').forEach(page => {
    page.classList.toggle('active', page.id === pageId);
  });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageId);
  });

  renderAll();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => goToPage(btn.dataset.page));
});

document.querySelectorAll('[data-go]').forEach(btn => {
  btn.addEventListener('click', () => goToPage(btn.dataset.go));
});

function renderDashboard() {
  const today = new Date();
  const todayTransactions = transactions.filter(tx =>
    new Date(tx.createdAt).toDateString() === today.toDateString()
  );

  document.getElementById('statProducts').textContent = products.length;
  document.getElementById('statStock').textContent =
    products.reduce((sum, item) => sum + item.stock, 0);
  document.getElementById('statTodayTransactions').textContent =
    todayTransactions.length;
  document.getElementById('statTodayRevenue').textContent = rupiah(
    todayTransactions.reduce((sum, tx) => sum + tx.total, 0)
  );

  const recent = transactions.slice(0, 5);
  const container = document.getElementById('recentTransactions');

  container.innerHTML = recent.length
    ? recent.map(tx => `
      <div class="history-card">
        <div class="history-head">
          <div>
            <strong>${escapeHtml(tx.code)}</strong><br>
            <small>${dateTime(tx.createdAt)}</small>
          </div>
          <strong>${rupiah(tx.total)}</strong>
        </div>
        <div>${tx.items.length} jenis barang</div>
      </div>
    `).join('')
    : '<div class="empty-state">Belum ada transaksi.</div>';
}

function renderProducts() {
  const keyword = document.getElementById('productSearch').value.toLowerCase().trim();
  const filtered = products.filter(item => item.name.toLowerCase().includes(keyword));
  const tbody = document.getElementById('productTableBody');

  if (!filtered.length) {
    tbody.innerHTML =
      '<tr><td colspan="4"><div class="empty-state">Barang tidak ditemukan.</div></td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td>${rupiah(item.price)}</td>
      <td>${item.stock}</td>
      <td>
        <div class="action-cell">
          <button class="small-btn edit" data-edit="${item.id}">Edit</button>
          <button class="small-btn delete" data-delete="${item.id}">Hapus</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openProductModal(btn.dataset.edit));
  });

  tbody.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => deleteProduct(btn.dataset.delete));
  });
}

function renderCashierProducts() {
  const keyword = document.getElementById('cashierSearch').value.toLowerCase().trim();
  const filtered = products.filter(item => item.name.toLowerCase().includes(keyword));
  const container = document.getElementById('cashierProducts');

  if (!filtered.length) {
    container.innerHTML = '<div class="empty-state">Barang tidak ditemukan.</div>';
    return;
  }

  container.innerHTML = filtered.map(item => `
    <button class="product-card" data-add="${item.id}" ${item.stock <= 0 ? 'disabled' : ''}>
      <h4>${escapeHtml(item.name)}</h4>
      <strong>${rupiah(item.price)}</strong>
      <span>Stok: ${item.stock}</span>
    </button>
  `).join('');

  container.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', () => addToCart(btn.dataset.add));
  });
}

function renderCart() {
  const container = document.getElementById('cartItems');

  container.innerHTML = cart.length
    ? cart.map(item => `
      <div class="cart-item">
        <div class="cart-item-head">
          <h4>${escapeHtml(item.name)}</h4>
          <span>${rupiah(item.price * item.quantity)}</span>
        </div>
        <div class="qty-row">
          <button class="qty-btn" data-decrease="${item.productId}">−</button>
          <strong>${item.quantity}</strong>
          <button class="qty-btn" data-increase="${item.productId}">+</button>
          <button class="remove-btn" data-remove="${item.productId}">Hapus</button>
        </div>
      </div>
    `).join('')
    : '<div class="empty-state">Keranjang masih kosong.</div>';

  document.getElementById('cartTotal').textContent = rupiah(
    cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  );

  container.querySelectorAll('[data-decrease]').forEach(btn => {
    btn.addEventListener('click', () => changeCartQuantity(btn.dataset.decrease, -1));
  });
  container.querySelectorAll('[data-increase]').forEach(btn => {
    btn.addEventListener('click', () => changeCartQuantity(btn.dataset.increase, 1));
  });
  container.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      cart = cart.filter(item => item.productId !== btn.dataset.remove);
      renderCart();
    });
  });
}

function getFilteredTransactions() {
  const filter = document.getElementById('historyFilter').value;
  const keyword = document.getElementById('historySearch').value.toLowerCase().trim();
  const now = new Date();

  return transactions.filter(tx => {
    const txDate = new Date(tx.createdAt);
    const matchDate =
      filter === 'all' ||
      (filter === 'today' && txDate.toDateString() === now.toDateString()) ||
      (filter === 'month' &&
        txDate.getMonth() === now.getMonth() &&
        txDate.getFullYear() === now.getFullYear());

    const matchKeyword =
      !keyword ||
      tx.code.toLowerCase().includes(keyword) ||
      tx.items.some(item => item.name.toLowerCase().includes(keyword));

    return matchDate && matchKeyword;
  });
}

function renderHistory() {
  const filtered = getFilteredTransactions();
  const container = document.getElementById('historyList');

  document.getElementById('historyCount').textContent = filtered.length;
  document.getElementById('historyRevenue').textContent = rupiah(
    filtered.reduce((sum, tx) => sum + tx.total, 0)
  );

  container.innerHTML = filtered.length
    ? filtered.map(tx => `
      <article class="history-card">
        <div class="history-head">
          <div>
            <strong>${escapeHtml(tx.code)}</strong><br>
            <small>${dateTime(tx.createdAt)}</small>
          </div>
          <strong>${rupiah(tx.total)}</strong>
        </div>
        <ul class="history-items">
          ${tx.items.map(item => `
            <li>${escapeHtml(item.name)} — ${item.quantity} × ${rupiah(item.price)}</li>
          `).join('')}
        </ul>
        <div class="history-total">Total: ${rupiah(tx.total)}</div>
      </article>
    `).join('')
    : '<div class="empty-state">Belum ada transaksi sesuai filter.</div>';
}

function renderAll() {
  renderDashboard();
  renderProducts();
  renderCashierProducts();
  renderCart();
  renderHistory();
}

function openProductModal(id = '') {
  const form = document.getElementById('productForm');
  form.reset();
  document.getElementById('productId').value = '';
  document.getElementById('modalTitle').textContent = 'Tambah Barang';

  if (id) {
    const item = products.find(product => product.id === id);
    if (!item) return;

    document.getElementById('modalTitle').textContent = 'Edit Barang';
    document.getElementById('productId').value = item.id;
    document.getElementById('productName').value = item.name;
    document.getElementById('productPrice').value = item.price;
    document.getElementById('productStock').value = item.stock;
  }

  document.getElementById('productModal').classList.remove('hidden');
  document.getElementById('productName').focus();
}

function closeProductModal() {
  document.getElementById('productModal').classList.add('hidden');
}

async function deleteProduct(id) {
  const item = products.find(product => product.id === id);
  if (!item || !confirm(`Hapus barang "${item.name}"?`)) return;

  const { error } = await db.from('products').delete().eq('id', id);

  if (error) {
    showToast('Barang gagal dihapus.');
    return;
  }

  cart = cart.filter(cartItem => cartItem.productId !== id);
  await loadProducts();
  renderAll();
  showToast('Barang berhasil dihapus.');
}

function addToCart(productId) {
  const product = products.find(item => item.id === productId);
  if (!product || product.stock <= 0) return;

  const existing = cart.find(item => item.productId === productId);

  if (existing) {
    if (existing.quantity >= product.stock) {
      showToast('Jumlah melebihi stok yang tersedia.');
      return;
    }
    existing.quantity += 1;
  } else {
    cart.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1
    });
  }

  renderCart();
}

function changeCartQuantity(productId, amount) {
  const item = cart.find(cartItem => cartItem.productId === productId);
  const product = products.find(productItem => productItem.id === productId);
  if (!item || !product) return;

  const next = item.quantity + amount;

  if (next <= 0) {
    cart = cart.filter(cartItem => cartItem.productId !== productId);
  } else if (next > product.stock) {
    showToast('Jumlah melebihi stok yang tersedia.');
  } else {
    item.quantity = next;
  }

  renderCart();
}

async function checkout() {
  if (!cart.length) {
    showToast('Keranjang masih kosong.');
    return;
  }

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (!confirm(`Selesaikan transaksi sebesar ${rupiah(total)}?`)) return;

  const button = document.getElementById('checkoutBtn');
  setLoading(button, true, 'Menyimpan...');

  const saleItems = cart.map(item => ({
    product_id: item.productId,
    quantity: item.quantity
  }));

  const { error } = await db.rpc('process_sale', {
    sale_items: saleItems
  });

  setLoading(button, false);

  if (error) {
    console.error(error);
    showToast(error.message || 'Transaksi gagal disimpan.');
    return;
  }

  cart = [];
  await loadAllData();
  showToast('Transaksi tersimpan dan stok berhasil dikurangi.');
}

function downloadCsv() {
  const filtered = getFilteredTransactions();

  if (!filtered.length) {
    showToast('Tidak ada data untuk diunduh.');
    return;
  }

  const rows = [
    ['Kode Transaksi', 'Tanggal', 'Nama Barang', 'Jumlah', 'Harga', 'Subtotal']
  ];

  filtered.forEach(tx => {
    tx.items.forEach(item => {
      rows.push([
        tx.code,
        dateTime(tx.createdAt),
        item.name,
        item.quantity,
        item.price,
        item.price * item.quantity
      ]);
    });
  });

  rows.push([]);
  rows.push([
    'TOTAL PENJUALAN', '', '', '', '',
    filtered.reduce((sum, tx) => sum + tx.total, 0)
  ]);

  // Excel Indonesia umumnya memakai titik koma sebagai pemisah kolom.
  const csv = '\uFEFF' + rows.map(row =>
    row.map(value => {
      const text = String(value ?? '').replaceAll('"', '""');
      return `"${text}"`;
    }).join(';')
  ).join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `rekapan-warung-bu-dedi-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

document.getElementById('openProductModal').addEventListener('click', () => openProductModal());
document.getElementById('closeProductModal').addEventListener('click', closeProductModal);
document.getElementById('cancelProductModal').addEventListener('click', closeProductModal);
document.getElementById('productModal').addEventListener('click', event => {
  if (event.target.id === 'productModal') closeProductModal();
});

document.getElementById('productForm').addEventListener('submit', async event => {
  event.preventDefault();

  const id = document.getElementById('productId').value;
  const payload = {
    name: document.getElementById('productName').value.trim(),
    price: Number(document.getElementById('productPrice').value),
    stock: Number(document.getElementById('productStock').value)
  };

  if (!payload.name || payload.price < 0 || payload.stock < 0 || !Number.isInteger(payload.stock)) {
    showToast('Periksa kembali data barang.');
    return;
  }

  const query = id
    ? db.from('products').update(payload).eq('id', id)
    : db.from('products').insert(payload);

  const { error } = await query;

  if (error) {
    console.error(error);
    showToast('Barang gagal disimpan.');
    return;
  }

  closeProductModal();
  await loadProducts();
  renderAll();
  showToast(id ? 'Barang berhasil diperbarui.' : 'Barang berhasil ditambahkan.');
});

document.getElementById('productSearch').addEventListener('input', renderProducts);
document.getElementById('cashierSearch').addEventListener('input', renderCashierProducts);
document.getElementById('historySearch').addEventListener('input', renderHistory);
document.getElementById('historyFilter').addEventListener('change', renderHistory);
document.getElementById('checkoutBtn').addEventListener('click', checkout);
document.getElementById('downloadCsv').addEventListener('click', downloadCsv);
document.getElementById('clearCart').addEventListener('click', () => {
  cart = [];
  renderCart();
});

initializeApp();
