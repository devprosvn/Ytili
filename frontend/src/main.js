import './custom.css' // use Ytili theme
import javascriptLogo from './javascript.svg'
import viteLogo from '/vite.svg'
import { setupCounter } from './counter.js'
import { getDonationRegistryContract, DonationType } from './eth.js'

// MetaMask wallet connection
const connectButton = document.getElementById('connectButton');
let userAddress = null;
const marketplaceButton = document.getElementById('marketplaceButton');
const profileButton = document.getElementById('profileButton');
const flexibleButton = document.getElementById('flexibleButton');
const API_URL = 'http://localhost:3000';
async function connectWallet() {
  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      userAddress = accounts[0];
      connectButton.innerText = userAddress;
      profileButton.style.display = 'inline-block';
      marketplaceButton.style.display = 'inline-block';
      connectButton.style.display = 'none';
        alert('Ví kết nối thành công!');
    } catch (err) {
      console.error(err);
    }
  } else {
    alert('Vui lòng cài MetaMask!');
  }
}
connectButton.addEventListener('click', connectWallet);

// Marketplace handler
marketplaceButton.addEventListener('click', showMarketplacePage);
flexibleButton.addEventListener('click', showFlexibleDonationPage);

// Flexible donation handler
async function showFlexibleDonationPage() {
  profileButton.classList.remove('active');
  marketplaceButton.classList.remove('active');
  flexibleButton.classList.add('active');
  document.querySelector('#app').innerHTML = `
    <h2>Quyên góp tự do</h2>
    <form id="flexibleForm">
      <label>Hình ảnh: <input type="file" id="fileInput" accept="image/*" /></label><br/>
      <label>Tên vật phẩm:<input id="itemNameInput" /></label><br/>
      <label>Mô tả:<textarea id="descriptionInput"></textarea></label><br/>
      <label>Số lượng:<input id="flexQtyInput" type="number" min="1" value="1" /></label><br/>
      <label>Đơn vị:<input id="unitInput" value="cái" /></label><br/>
      <button type="submit" class="btn-gradient">Gửi</button>
    </form>
    <div id="flexibleMsg"></div>
  `;
  const form = document.getElementById('flexibleForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    // fetch profile for sender info
    const profileRes = await fetch(`${API_URL}/api/profile?address=${userAddress}`);
    const profile = await profileRes.json();
    const senderName = profile.name || '';
    const senderPhone = profile.phone || '';
    const senderAddress = userAddress;
    // read file
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      const donationId = 'flex-' + Date.now();
      // upload image
      const uploadRes = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: donationId + '-' + file.name, content: base64, contentType: file.type })
      });
      const { url } = await uploadRes.json();
      // on-chain donation
      const registry = getDonationRegistryContract();
      const tx = await registry.recordDonation(
        donationId,
        userAddress,
        DonationType.CASH,
        document.getElementById('itemNameInput').value,
        document.getElementById('descriptionInput').value,
        0,
        document.getElementById('itemNameInput').value,
        parseInt(document.getElementById('flexQtyInput').value, 10),
        document.getElementById('unitInput').value,
        ''
      );
      document.getElementById('flexibleMsg').innerHTML = `<p>⏳ Đang gửi giao dịch... <a href="${EXPLORER_BASE}${tx.hash}" target="_blank">${tx.hash}</a></p>`;
      await tx.wait();
      document.getElementById('flexibleMsg').innerHTML = `<p>✅ Giao dịch thành công! <a href="${EXPLORER_BASE}${tx.hash}" target="_blank">Xem</a></p>`;
      // off-chain donation record
      await fetch(`${API_URL}/api/donation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donationId,
          txHash: tx.hash,
          donorAddress: userAddress,
          type: DonationType.CASH,
          title: document.getElementById('itemNameInput').value,
          description: document.getElementById('descriptionInput').value,
          quantity: parseInt(document.getElementById('flexQtyInput').value, 10),
          unit: document.getElementById('unitInput').value,
          amount: 0,
          itemName: document.getElementById('itemNameInput').value
        })
      });
      // off-chain flexible item record
      await fetch(`${API_URL}/api/flexible`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donationId,
          imageIpfs: url,
          senderName,
          senderPhone,
          senderAddress
        })
      });
      document.getElementById('flexibleMsg').innerHTML += '<p style="color:green;">Lưu thành công!</p>';
    };
    reader.readAsDataURL(file);
  });
}

const mockItems = [
  { id: 'item1', name: 'Găng tay y tế', image: 'https://placehold.co/100x100', description: 'Hộp 100 chiếc', unit: 'hộp', donationType: DonationType.MEDICAL_SUPPLY },
  { id: 'item2', name: 'Khẩu trang N95', image: 'https://placehold.co/100x100', description: 'Hộp 50 chiếc', unit: 'hộp', donationType: DonationType.MEDICAL_SUPPLY },
  { id: 'item3', name: 'Paracetamol 500mg', image: 'https://placehold.co/100x100', description: 'Hộp 10 vỉ', unit: 'hộp', donationType: DonationType.MEDICATION }
];

function showMarketplacePage() {
        // highlight nav
        profileButton.classList.remove('active');
        marketplaceButton.classList.add('active');
  let html = '<h2>Chợ Ytili</h2><div class="market-grid">';
  mockItems.forEach((item, idx) => {
    html += `
      <div class="card">
        <img src="${item.image}" alt="${item.name}" />
        <h3>${item.name}</h3>
        <p>${item.description}</p>
        <button class="btn-gradient donate-btn" data-idx="${idx}">Quyên góp</button>
      </div>
    `;
  });
  html += '</div><div id="modal" class="modal hidden"></div>';
  document.querySelector('#app').innerHTML = html;

  document.querySelectorAll('.donate-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = e.target.getAttribute('data-idx');
      openDonateModal(mockItems[idx]);
    });
  });
}

const EXPLORER_BASE = 'https://explorer.saga.xyz/tx/';

function openDonateModal(item) {
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-content">
      <span class="close-btn">&times;</span>
      <h3>Quyên góp – ${item.name}</h3>
      <label>Số lượng:<input id="qtyInput" type="number" min="1" value="1" /></label><br />
      <button id="confirmDonate" class="btn-gradient">Xác nhận</button>
    </div>
  `;
  modal.classList.remove('hidden');
  modal.querySelector('.close-btn').onclick = () => modal.classList.add('hidden');
  modal.querySelector('#confirmDonate').onclick = () => {
    const qty = parseInt(document.getElementById('qtyInput').value, 10);
    if (!qty || qty <= 0) { alert('Số lượng phải > 0'); return; }
    donateOnChain(item, qty);
    
  };
}

async function donateOnChain(item, qty) {
  try {
    const registry = getDonationRegistryContract();
    const donationId = 'don-' + Date.now().toString();
    const tx = await registry.recordDonation(
      donationId,
      userAddress,
      item.donationType,
      item.name,
      item.description,
      0,
      item.name,
      qty,
      item.unit,
      ''
    );
    const modal = document.getElementById('modal');
    modal.innerHTML = `<p>⏳ Đang gửi giao dịch... <a href="${EXPLORER_BASE}${tx.hash}" target="_blank">${tx.hash}</a></p>`;
    const receipt = await tx.wait();
    modal.innerHTML = `<p>✅ Giao dịch thành công! <a href="${EXPLORER_BASE}${tx.hash}" target="_blank">Xem trên Explorer</a></p>`;
    // Lưu lịch sử offchain
    fetch(`${API_URL}/api/donation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        donationId,
        txHash: tx.hash,
        donorAddress: userAddress,
        type: item.donationType,
        title: item.name,
        description: item.description,
        quantity: qty,
        unit: item.unit,
        amount: 0,
        itemName: item.name
      })
    }).catch(err => console.error('save donation failed', err));
  } catch (err) {
    console.error(err);
    alert('Lỗi gửi giao dịch: ' + (err?.message || err));
  }
}

// Profile page handler
profileButton.addEventListener('click', showProfilePage);

function showProfilePage() {
        // highlight nav
        profileButton.classList.add('active');
        marketplaceButton.classList.remove('active');
  fetch(`${API_URL}/api/profile?address=${userAddress}`)
    .then(res => res.json())
    .then(data => {
      document.querySelector('#app').innerHTML = `
        <h2>Hồ sơ của bạn</h2>
        <form id="profileForm">
          <label>Tên:<input id="name" value="${data.name||''}" /></label><br />
          <label>SĐT:<input id="phone" value="${data.phone||''}" /></label><br />
          <label>Email:<input id="email" value="${data.email||''}" /></label><br />
          <button type="submit">Lưu</button>
        </form>
        <div id="msg"></div>
      `;
      document.getElementById('name').placeholder = 'Nhập tên của bạn';
          document.getElementById('phone').placeholder = 'Nhập số điện thoại';
          document.getElementById('email').placeholder = 'Nhập email';
        const form = document.getElementById('profileForm');
      form.addEventListener('submit', e => {
        e.preventDefault();
        const name = document.getElementById('name').value;
        const phone = document.getElementById('phone').value;
        const email = document.getElementById('email').value;
        fetch(`${API_URL}/api/profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: userAddress, name, phone, email })
        })
          .then(res => res.json())
          .then(res => { document.getElementById('msg').innerHTML = '<span style="color:green;">Lưu thành công!</span>'; })
          .catch(err => console.error(err));
      });
    })
    .catch(err => console.error(err));
}

document.querySelector('#app').innerHTML = `
  <div>
    <a href="https://vite.dev" target="_blank">
      <img src="${viteLogo}" class="logo" alt="Vite logo" />
    </a>
    <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript" target="_blank">
      <img src="${javascriptLogo}" class="logo vanilla" alt="JavaScript logo" />
    </a>
    <h1>Hello Vite!</h1>
    <div class="card">
      <button id="counter" type="button"></button>
    </div>
    <p class="read-the-docs">
      Click on the Vite logo to learn more
    </p>
  </div>
`

setupCounter(document.querySelector('#counter'))

