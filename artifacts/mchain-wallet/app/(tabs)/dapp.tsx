import { Icon } from "@/components/Icon";
import { useWallet } from "@/context/WalletContext";
import { useColors } from "@/hooks/useColors";
import { getNodeUrl } from "@/services/node";
import {
  signEvmTransaction,
  signPersonalMessage,
  weiToMc,
} from "@/services/crypto";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";

// ── Chain constants ────────────────────────────────────────────────────────────
const CHAIN_ID_HEX = "0x760"; // 1888
const CHAIN_ID_DEC = "1888";
const CHAIN_NAME = "MChain";

// ── Wallet-specific RPC methods that must go through RN ───────────────────────
const WALLET_METHODS = new Set([
  "eth_requestAccounts",
  "eth_accounts",
  "eth_sendTransaction",
  "personal_sign",
  "eth_sign",
  "eth_signTypedData",
  "eth_signTypedData_v1",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
  "wallet_requestPermissions",
  "wallet_getPermissions",
  "wallet_switchEthereumChain",
  "wallet_addEthereumChain",
]);

// ── Injected provider script (runs before page JS) ────────────────────────────
function buildProviderScript(ethAddress: string | null, rpcUrl: string): string {
  const accounts = ethAddress ? JSON.stringify([ethAddress.toLowerCase()]) : "[]";
  return `
(function() {
  if (window.ethereum && window.ethereum._isMChain) return;

  var _accounts = ${accounts};
  var _pending = {};
  var _listeners = {};
  var RPC_URL = ${JSON.stringify(rpcUrl)};
  var WALLET_METHODS = ${JSON.stringify([...WALLET_METHODS])};

  function isWalletMethod(m) {
    return WALLET_METHODS.indexOf(m) !== -1;
  }

  function emit(event, data) {
    (_listeners[event] || []).forEach(function(fn) {
      try { fn(data); } catch(e) {}
    });
  }

  // Called by React Native to resolve/reject a pending request
  window.__mcResolve = function(id, result) {
    var cb = _pending[id];
    if (!cb) return;
    delete _pending[id];
    cb.resolve(result);
  };
  window.__mcReject = function(id, code, message) {
    var cb = _pending[id];
    if (!cb) return;
    delete _pending[id];
    var err = new Error(message || 'User rejected the request.');
    err.code = code || 4001;
    cb.reject(err);
  };
  // Called by React Native to push events (accountsChanged, chainChanged)
  window.__mcEmit = function(event, data) {
    if (event === 'accountsChanged') {
      _accounts = data || [];
      ethereum.selectedAddress = _accounts[0] || null;
    }
    emit(event, data);
  };

  function rpcFetch(method, params) {
    return fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params || [] }),
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (res.error) {
        var e = new Error(res.error.message || 'RPC error');
        e.code = res.error.code;
        throw e;
      }
      return res.result;
    });
  }

  var ethereum = {
    isMetaMask: true,
    isMChainWallet: true,
    _isMChain: true,
    chainId: '${CHAIN_ID_HEX}',
    networkVersion: '${CHAIN_ID_DEC}',
    selectedAddress: _accounts[0] || null,

    request: function(payload) {
      var method = payload.method;
      var params = payload.params || [];

      // Handle statically (no user interaction needed)
      if (method === 'eth_chainId') return Promise.resolve('${CHAIN_ID_HEX}');
      if (method === 'net_version') return Promise.resolve('${CHAIN_ID_DEC}');
      if (method === 'eth_accounts') return Promise.resolve(_accounts.slice());

      // Wallet methods → bridge to React Native
      if (isWalletMethod(method)) {
        return new Promise(function(resolve, reject) {
          var id = 'mc_' + Date.now() + '_' + Math.floor(Math.random() * 1e9);
          _pending[id] = { resolve: resolve, reject: reject };
          window.ReactNativeWebView.postMessage(JSON.stringify({ id: id, method: method, params: params }));
        });
      }

      // Everything else → direct RPC fetch
      return rpcFetch(method, params);
    },

    on: function(event, fn) {
      if (!_listeners[event]) _listeners[event] = [];
      _listeners[event].push(fn);
      return this;
    },
    removeListener: function(event, fn) {
      if (_listeners[event]) _listeners[event] = _listeners[event].filter(function(f) { return f !== fn; });
      return this;
    },
    off: function(event, fn) { return this.removeListener(event, fn); },

    // Legacy
    enable: function() { return this.request({ method: 'eth_requestAccounts' }); },
    sendAsync: function(payload, cb) {
      this.request({ method: payload.method, params: payload.params || [] })
        .then(function(r) { cb(null, { id: payload.id, jsonrpc: '2.0', result: r }); })
        .catch(function(e) { cb(e); });
    },
    send: function(m, p) {
      if (typeof m === 'string') return this.request({ method: m, params: p || [] });
      return this.request({ method: m.method, params: m.params || [] });
    },
  };

  window.ethereum = ethereum;
  // Legacy web3 shim
  if (!window.web3) window.web3 = {};
  window.web3.currentProvider = ethereum;
})();
true;
`;
}

// ── Featured dApps ─────────────────────────────────────────────────────────────
const FEATURED_DAPPS = [
  { id: "explorer", name: "MChain Explorer", desc: "Browse blocks, txs and addresses", url: "https://explorer.mvault.pro", icon: "search-outline", color: "#0EA5E9" },
  { id: "bridge", name: "MChain Bridge", desc: "Bridge assets between networks", url: "https://bridge.mvault.pro", icon: "swap-horizontal-outline", color: "#8B5CF6" },
  { id: "swap", name: "MChain Swap", desc: "Swap tokens on MChain", url: "https://swap.mvault.pro", icon: "repeat-outline", color: "#10B981" },
  { id: "staking", name: "Staking Portal", desc: "Stake MC and earn rewards", url: "https://stake.mvault.pro", icon: "server-outline", color: "#F59E0B" },
  { id: "governance", name: "Governance", desc: "Participate in MChain governance", url: "https://gov.mvault.pro", icon: "people-outline", color: "#EF4444" },
  { id: "nft", name: "NFT Marketplace", desc: "Buy and sell MChain NFTs", url: "https://nft.mvault.pro", icon: "images-outline", color: "#EC4899" },
];

function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return "https://" + t;
}

function shortAddr(addr: string): string {
  if (!addr) return "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

// ── Pending request types ──────────────────────────────────────────────────────
interface ConnectReq { id: string; origin: string }
interface SignReq { id: string; message: string; address: string; origin: string }
interface SendTxReq {
  id: string;
  to: string;
  value: string;
  data: string;
  gas: string;
  origin: string;
}

export default function DAppScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { ethAddress, getPrivateKey } = useWallet();

  // ── Browser state ────────────────────────────────────────────────────────────
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [displayUrl, setDisplayUrl] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Wallet connection state ──────────────────────────────────────────────────
  const [isConnected, setIsConnected] = useState(false);

  // ── Pending modals ───────────────────────────────────────────────────────────
  const [connectReq, setConnectReq] = useState<ConnectReq | null>(null);
  const [signReq, setSignReq] = useState<SignReq | null>(null);
  const [sendTxReq, setSendTxReq] = useState<SendTxReq | null>(null);
  const [txBusy, setTxBusy] = useState(false);

  const webViewRef = useRef<WebView>(null);

  // ── WebView helpers ──────────────────────────────────────────────────────────
  function runInWebView(js: string) {
    webViewRef.current?.injectJavaScript(js + "; true;");
  }
  function resolveRequest(id: string, result: unknown) {
    runInWebView(`window.__mcResolve(${JSON.stringify(id)}, ${JSON.stringify(result)})`);
  }
  function rejectRequest(id: string, code = 4001, msg = "User rejected the request.") {
    runInWebView(`window.__mcReject(${JSON.stringify(id)}, ${code}, ${JSON.stringify(msg)})`);
  }
  function emitEvent(event: string, data: unknown) {
    runInWebView(`window.__mcEmit(${JSON.stringify(event)}, ${JSON.stringify(data)})`);
  }

  // ── Origin helper ─────────────────────────────────────────────────────────
  function originOf(url: string): string {
    try { return new URL(url).hostname; } catch { return url; }
  }

  // ── WebView message handler ──────────────────────────────────────────────────
  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    let msg: { id: string; method: string; params: unknown[] };
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }
    const { id, method, params } = msg;
    const origin = originOf(displayUrl);

    switch (method) {
      // ── Connection ──────────────────────────────────────────────────────────
      case "eth_requestAccounts":
      case "wallet_requestPermissions": {
        if (isConnected && ethAddress) {
          // Already connected — return immediately
          resolveRequest(id, method === "wallet_requestPermissions"
            ? [{ parentCapability: "eth_accounts" }]
            : [ethAddress.toLowerCase()]);
          return;
        }
        setConnectReq({ id, origin });
        break;
      }

      case "wallet_getPermissions": {
        if (isConnected) {
          resolveRequest(id, [{ parentCapability: "eth_accounts" }]);
        } else {
          resolveRequest(id, []);
        }
        break;
      }

      case "wallet_switchEthereumChain": {
        // We only support MChain (1888) — always "switch" to it
        resolveRequest(id, null);
        break;
      }

      case "wallet_addEthereumChain": {
        resolveRequest(id, null);
        break;
      }

      // ── Sign ────────────────────────────────────────────────────────────────
      case "personal_sign":
      case "eth_sign": {
        if (!ethAddress) { rejectRequest(id); return; }
        // personal_sign params: [message, address] or [address, message]
        // eth_sign params: [address, message]
        const p = params as string[];
        let message = p[0];
        let addr = p[1];
        // If p[0] looks like an address (0x + 40 hex chars), swap
        if (/^0x[0-9a-f]{40}$/i.test(p[0]) && p[1] && p[1].length > 42) {
          message = p[1]; addr = p[0];
        }
        // Decode message for display (keep raw for signing)
        let displayMsg = message;
        try {
          if (message.startsWith("0x")) {
            displayMsg = Buffer.from(message.slice(2), "hex").toString("utf8");
          }
        } catch { /* keep original */ }
        signReqRaw.current = message; // raw (possibly hex) used for actual signing
        setSignReq({ id, message: displayMsg, address: addr ?? ethAddress, origin });
        break;
      }

      case "eth_signTypedData":
      case "eth_signTypedData_v1":
      case "eth_signTypedData_v3":
      case "eth_signTypedData_v4": {
        // Typed data signing — show a simplified modal
        const p = params as [string, unknown];
        const addr2 = p[0];
        const typedData = p[1];
        const displayMsg2 = typeof typedData === "string" ? typedData : JSON.stringify(typedData, null, 2);
        signReqRaw.current = typeof typedData === "string" ? typedData : JSON.stringify(typedData);
        setSignReq({ id, message: displayMsg2, address: addr2, origin });
        break;
      }

      // ── Send Transaction ─────────────────────────────────────────────────────
      case "eth_sendTransaction": {
        if (!ethAddress) { rejectRequest(id); return; }
        const tx = (params as Record<string, string>[])[0] ?? {};
        setSendTxReq({
          id,
          to: tx.to ?? "",
          value: tx.value ?? "0x0",
          data: tx.data ?? "0x",
          gas: tx.gas ?? "0x5208",
          origin,
        });
        break;
      }

      default:
        // Forward to RPC — handled client-side in the injected script, should not reach here
        rejectRequest(id, -32601, `Method ${method} not supported`);
    }
  }, [displayUrl, isConnected, ethAddress]);

  // Ref to hold the raw (possibly hex) message for personal_sign
  const signReqRaw = useRef<string>("");

  // ── Navigation ───────────────────────────────────────────────────────────────
  function openDApp(url: string) {
    const target = normalizeUrl(url);
    if (!target) return;
    Keyboard.dismiss();
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.open(target, "_blank");
      return;
    }
    setDisplayUrl(target);
    setActiveUrl(target);
    setCanGoBack(false);
    setCanGoForward(false);
    setIsConnected(false); // reset connection per site
  }

  function handleNavStateChange(nav: WebViewNavigation) {
    setCanGoBack(nav.canGoBack);
    setCanGoForward(nav.canGoForward);
    if (nav.url) setDisplayUrl(nav.url);
  }

  function handleClose() {
    setActiveUrl(null);
    setDisplayUrl("");
    setUrlInput("");
    setCanGoBack(false);
    setCanGoForward(false);
    setLoading(false);
    setIsConnected(false);
    setConnectReq(null);
    setSignReq(null);
    setSendTxReq(null);
  }

  // ── Connect approval ──────────────────────────────────────────────────────────
  function approveConnect() {
    if (!connectReq || !ethAddress) return;
    const addr = ethAddress.toLowerCase();
    if (connectReq.id.startsWith("wallet_")) {
      resolveRequest(connectReq.id, [{ parentCapability: "eth_accounts" }]);
    } else {
      resolveRequest(connectReq.id, [addr]);
    }
    emitEvent("accountsChanged", [addr]);
    setIsConnected(true);
    setConnectReq(null);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
  function rejectConnect() {
    if (!connectReq) return;
    rejectRequest(connectReq.id, 4001, "User rejected the connection request.");
    setConnectReq(null);
  }

  // ── Sign approval ─────────────────────────────────────────────────────────────
  async function approveSign() {
    if (!signReq) return;
    const pk = await getPrivateKey();
    if (!pk) { rejectRequest(signReq.id, 4001, "No private key available"); setSignReq(null); return; }
    try {
      const rawMsg = signReqRaw.current || signReq.message;
      const sig = signPersonalMessage(rawMsg, pk);
      resolveRequest(signReq.id, sig);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      rejectRequest(signReq.id, -32603, e instanceof Error ? e.message : "Signing failed");
    }
    setSignReq(null);
  }
  function rejectSign() {
    if (!signReq) return;
    rejectRequest(signReq.id, 4001, "User rejected the signing request.");
    setSignReq(null);
  }

  // ── Send Tx approval ──────────────────────────────────────────────────────────
  async function approveSendTx() {
    if (!sendTxReq || !ethAddress) return;
    setTxBusy(true);
    try {
      const pk = await getPrivateKey();
      if (!pk) throw new Error("No private key");
      const rpcUrl = getNodeUrl() + "/rpc";

      // Get nonce
      const nonceRes = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionCount", params: [ethAddress, "latest"] }),
      }).then(r => r.json());
      const nonce = parseInt(nonceRes.result, 16);

      const valueWei = BigInt(sendTxReq.value === "0x" ? "0x0" : sendTxReq.value);
      const signed = signEvmTransaction(sendTxReq.to, valueWei, nonce, pk, {
        gasLimit: BigInt(parseInt(sendTxReq.gas || "0x5208", 16)),
      });

      const sendRes = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_sendRawTransaction", params: [signed] }),
      }).then(r => r.json());

      if (sendRes.error) throw new Error(sendRes.error.message);
      resolveRequest(sendTxReq.id, sendRes.result);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSendTxReq(null);
    } catch (e) {
      rejectRequest(sendTxReq.id, -32603, e instanceof Error ? e.message : "Transaction failed");
      setSendTxReq(null);
      Alert.alert("Transaction Failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setTxBusy(false);
    }
  }
  function rejectSendTx() {
    if (!sendTxReq) return;
    rejectRequest(sendTxReq.id, 4001, "User rejected the transaction.");
    setSendTxReq(null);
  }

  // ── Styles ────────────────────────────────────────────────────────────────────
  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), paddingHorizontal: 20, paddingBottom: 16 },
    title: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 4 },
    subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    searchBar: { flexDirection: "row", alignItems: "center", marginHorizontal: 20, marginBottom: 24, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, gap: 8 },
    input: { flex: 1, paddingVertical: 13, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground },
    goBtn: { width: 32, height: 32, borderRadius: 10, overflow: "hidden" as const },
    goBtnGrad: { width: 32, height: 32, alignItems: "center" as const, justifyContent: "center" as const },
    sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.5, marginHorizontal: 20, marginBottom: 12 },
    grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 14, gap: 10, paddingBottom: 40 + insets.bottom },
    card: { width: "47%", backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
    cardIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: "center" as const, justifyContent: "center" as const },
    cardName: { fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground },
    cardDesc: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 16 },
    openRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
    openText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

    // Browser chrome
    browserChrome: { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 4), backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    browserTopRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 6, gap: 4 },
    navBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    urlBar: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.background, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, height: 36, gap: 6 },
    urlText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: colors.foreground },
    homeBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    progressBar: { height: 2, backgroundColor: colors.primary },

    // Connected badge row
    connectedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border + "60" },
    connectedLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
    connectedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#10B981" },
    connectedChain: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#10B981" },
    connectedAddr: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    disconnectBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
    disconnectText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },

    // WebView
    webview: { flex: 1, backgroundColor: colors.background },

    // Modal overlay
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginTop: 12, marginBottom: 4 },
    sheetHeader: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
    sheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center" },
    sheetSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", marginTop: 4 },
    originRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.background, borderRadius: 12, marginHorizontal: 20, marginBottom: 16, padding: 12 },
    originText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground, flex: 1 },
    infoBox: { backgroundColor: colors.background, borderRadius: 12, marginHorizontal: 20, marginBottom: 16, padding: 14 },
    infoLabel: { fontSize: 10, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 1.2, marginBottom: 6 },
    infoValue: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 20 },
    infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    infoRowLast: { borderBottomWidth: 0 },
    infoRowLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    infoRowValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground, maxWidth: "60%" },
    btnRow: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 20, paddingTop: 4 },
    cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, alignItems: "center" },
    cancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    confirmBtn: { flex: 1, borderRadius: 14, overflow: "hidden" as const },
    confirmGrad: { paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
    confirmText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFF" },
    dangerBtn: { flex: 1, borderRadius: 14, overflow: "hidden" as const },
    dangerGrad: { paddingVertical: 14, alignItems: "center", justifyContent: "center" },
    dangerText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFF" },
  });

  // ── In-app browser ────────────────────────────────────────────────────────────
  if (activeUrl) {
    const shortUrl = displayUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const rpcUrl = getNodeUrl() + "/rpc";
    const injectedJS = buildProviderScript(isConnected ? ethAddress : null, rpcUrl);

    return (
      <View style={s.container}>
        {/* ── Browser chrome ─────────────────────────────────────────── */}
        <View style={s.browserChrome}>
          <View style={s.browserTopRow}>
            <TouchableOpacity style={[s.navBtn, !canGoBack && { opacity: 0.35 }]} onPress={() => webViewRef.current?.goBack()} disabled={!canGoBack} activeOpacity={0.7}>
              <Icon name="arrow-back" size={18} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.navBtn, !canGoForward && { opacity: 0.35 }]} onPress={() => webViewRef.current?.goForward()} disabled={!canGoForward} activeOpacity={0.7}>
              <Icon name="arrow-forward" size={18} color={colors.foreground} />
            </TouchableOpacity>

            <View style={s.urlBar}>
              <Icon name="globe-outline" size={12} color={colors.mutedForeground} />
              <Text style={s.urlText} numberOfLines={1} ellipsizeMode="tail">{shortUrl}</Text>
              {loading && <ActivityIndicator size="small" color={colors.primary} />}
            </View>

            <TouchableOpacity style={s.navBtn} onPress={() => webViewRef.current?.reload()} activeOpacity={0.7}>
              <Icon name="refresh-outline" size={18} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity style={s.homeBtn} onPress={handleClose} activeOpacity={0.8}>
              <Icon name="home" size={17} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Connected chain badge */}
          {isConnected && ethAddress && (
            <View style={s.connectedRow}>
              <View style={s.connectedLeft}>
                <View style={s.connectedDot} />
                <Text style={s.connectedChain}>{CHAIN_NAME} · Chain {CHAIN_ID_DEC}</Text>
                <Text style={s.connectedAddr}>{shortAddr(ethAddress)}</Text>
              </View>
              <TouchableOpacity
                style={s.disconnectBtn}
                onPress={() => {
                  setIsConnected(false);
                  emitEvent("accountsChanged", []);
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.7}
              >
                <Text style={s.disconnectText}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          )}

          {loading && <View style={[s.progressBar, { opacity: 0.7 }]} />}
        </View>

        <WebView
          ref={webViewRef}
          source={{ uri: activeUrl }}
          style={s.webview}
          injectedJavaScriptBeforeContentLoaded={injectedJS}
          onMessage={handleMessage}
          onNavigationStateChange={handleNavStateChange}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          allowsBackForwardNavigationGestures
          sharedCookiesEnabled
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mixedContentMode="compatibility"
        />

        {/* ── Connect approval modal ──────────────────────────────────── */}
        <Modal visible={!!connectReq} transparent animationType="slide" onRequestClose={rejectConnect}>
          <View style={s.overlay}>
            <View style={[s.sheet, { paddingBottom: insets.bottom }]}>
              <View style={s.sheetHandle} />
              <View style={s.sheetHeader}>
                <Text style={s.sheetTitle}>Connect Wallet</Text>
                <Text style={s.sheetSubtitle}>This site wants to connect to your MChain wallet</Text>
              </View>

              <View style={s.originRow}>
                <Icon name="globe-outline" size={18} color={colors.primary} />
                <Text style={s.originText}>{connectReq?.origin}</Text>
              </View>

              <View style={s.infoBox}>
                <View style={s.infoRow}>
                  <Text style={s.infoRowLabel}>Wallet</Text>
                  <Text style={s.infoRowValue} numberOfLines={1}>{ethAddress ? shortAddr(ethAddress) : "—"}</Text>
                </View>
                <View style={[s.infoRow, s.infoRowLast]}>
                  <Text style={s.infoRowLabel}>Network</Text>
                  <Text style={s.infoRowValue}>{CHAIN_NAME} (Chain {CHAIN_ID_DEC})</Text>
                </View>
              </View>

              <View style={s.btnRow}>
                <TouchableOpacity style={s.cancelBtn} onPress={rejectConnect} activeOpacity={0.8}>
                  <Text style={s.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.confirmBtn} onPress={approveConnect} activeOpacity={0.85}>
                  <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.confirmGrad}>
                    <Icon name="link-outline" size={16} color="#FFF" />
                    <Text style={s.confirmText}>Connect</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── Sign approval modal ─────────────────────────────────────── */}
        <Modal visible={!!signReq} transparent animationType="slide" onRequestClose={rejectSign}>
          <View style={s.overlay}>
            <View style={[s.sheet, { paddingBottom: insets.bottom }]}>
              <View style={s.sheetHandle} />
              <View style={s.sheetHeader}>
                <Text style={s.sheetTitle}>Sign Message</Text>
                <Text style={s.sheetSubtitle}>Review and approve the message below</Text>
              </View>

              <View style={s.originRow}>
                <Icon name="globe-outline" size={18} color={colors.primary} />
                <Text style={s.originText}>{signReq?.origin}</Text>
              </View>

              <View style={s.infoBox}>
                <Text style={s.infoLabel}>MESSAGE</Text>
                <Text style={s.infoValue} selectable numberOfLines={8}>
                  {signReq?.message}
                </Text>
              </View>

              <View style={s.btnRow}>
                <TouchableOpacity style={s.cancelBtn} onPress={rejectSign} activeOpacity={0.8}>
                  <Text style={s.cancelText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.dangerBtn} onPress={approveSign} activeOpacity={0.85}>
                  <LinearGradient colors={["#F59E0B", "#D97706"]} style={s.dangerGrad}>
                    <Text style={s.dangerText}>Sign</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── Send Tx approval modal ──────────────────────────────────── */}
        <Modal visible={!!sendTxReq} transparent animationType="slide" onRequestClose={rejectSendTx}>
          <View style={s.overlay}>
            <View style={[s.sheet, { paddingBottom: insets.bottom }]}>
              <View style={s.sheetHandle} />
              <View style={s.sheetHeader}>
                <Text style={s.sheetTitle}>Confirm Transaction</Text>
                <Text style={s.sheetSubtitle}>{sendTxReq?.origin} wants to submit a transaction</Text>
              </View>

              <View style={s.infoBox}>
                <View style={s.infoRow}>
                  <Text style={s.infoRowLabel}>To</Text>
                  <Text style={s.infoRowValue} numberOfLines={1}>{sendTxReq ? shortAddr(sendTxReq.to) : ""}</Text>
                </View>
                <View style={s.infoRow}>
                  <Text style={s.infoRowLabel}>Amount</Text>
                  <Text style={s.infoRowValue}>
                    {sendTxReq ? weiToMc(BigInt(sendTxReq.value === "0x" || !sendTxReq.value ? "0" : sendTxReq.value).toString()) : "0"} MC
                  </Text>
                </View>
                <View style={[s.infoRow, s.infoRowLast]}>
                  <Text style={s.infoRowLabel}>Network</Text>
                  <Text style={s.infoRowValue}>{CHAIN_NAME}</Text>
                </View>
              </View>

              <View style={s.btnRow}>
                <TouchableOpacity style={s.cancelBtn} onPress={rejectSendTx} disabled={txBusy} activeOpacity={0.8}>
                  <Text style={s.cancelText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.dangerBtn} onPress={approveSendTx} disabled={txBusy} activeOpacity={0.85}>
                  <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.dangerGrad}>
                    {txBusy
                      ? <ActivityIndicator color="#FFF" />
                      : <Text style={s.dangerText}>Confirm</Text>
                    }
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ── Home / dApp grid ──────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Text style={s.title}>dApp Browser</Text>
          <Text style={s.subtitle}>Explore the MChain ecosystem</Text>
        </View>

        <View style={s.searchBar}>
          <Icon name="globe-outline" size={16} color={colors.mutedForeground} />
          <TextInput
            style={s.input}
            value={urlInput}
            onChangeText={setUrlInput}
            placeholder="Enter dApp URL…"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={() => openDApp(urlInput)}
          />
          {urlInput.trim().length > 0 && (
            <TouchableOpacity style={s.goBtn} onPress={() => openDApp(urlInput)} activeOpacity={0.85}>
              <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.goBtnGrad}>
                <Icon name="arrow-forward" size={16} color="#FFF" />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>

        <Text style={s.sectionLabel}>FEATURED DAPPS</Text>
        <View style={s.grid}>
          {FEATURED_DAPPS.map((dapp) => (
            <TouchableOpacity key={dapp.id} style={s.card} onPress={() => openDApp(dapp.url)} activeOpacity={0.8}>
              <View style={[s.cardIconWrap, { backgroundColor: dapp.color + "20" }]}>
                <Icon name={dapp.icon as Parameters<typeof Icon>[0]["name"]} size={22} color={dapp.color} />
              </View>
              <Text style={s.cardName}>{dapp.name}</Text>
              <Text style={s.cardDesc}>{dapp.desc}</Text>
              <View style={s.openRow}>
                <Icon name="open-outline" size={11} color={dapp.color} />
                <Text style={[s.openText, { color: dapp.color }]}>Open</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
