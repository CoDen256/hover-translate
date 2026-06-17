import { FC, useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { Page } from "@/shared/ui/Page/Page.tsx";
import { useStorage } from "@/shared/lib/hooks/useStorage.ts";
import type { AnkiDeck, AnkiNotetype, AnkiHistoryEntry } from "@shared/services/AnkiService.ts";

interface AnkiSettings {
  enabled: boolean;
  deckId: number | null;
  notetypeId: number | null;
  frontFieldIndex: number;
  backFieldIndex: number;
}

const DEFAULT_SETTINGS: AnkiSettings = {
  enabled: false,
  deckId: null,
  notetypeId: null,
  frontFieldIndex: 0,
  backFieldIndex: 1,
};

const sendMsg = <T = unknown>(action: string, data?: unknown): Promise<T> =>
  new Promise((resolve) => chrome.runtime.sendMessage({ action, data }, resolve));

const SyncPage: FC = () => {
  const { t } = useTranslation(["sync"]);
  const { get, set } = useStorage();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);

  const [decks, setDecks] = useState<AnkiDeck[]>([]);
  const [notetypes, setNotetypes] = useState<AnkiNotetype[]>([]);
  const [fields, setFields] = useState<string[]>([]);

  const [settings, setSettings] = useState<AnkiSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AnkiHistoryEntry[]>([]);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const loadHistory = useCallback(async () => {
    const res = await sendMsg<{ success: boolean; data?: AnkiHistoryEntry[] }>("ankiGetHistory");
    if (res.success && res.data) setHistory(res.data);
  }, []);

  type InfoData = { decks: AnkiDeck[]; notetypes: AnkiNotetype[]; currentDeckId: number | null; currentNotetypeId: number | null };

  const loadInfo = useCallback(async (): Promise<InfoData | null> => {
    const infoRes = await sendMsg<{ success: boolean; data?: InfoData }>("ankiGetInfo");
    if (infoRes.success && infoRes.data) {
      setDecks(infoRes.data.decks);
      setNotetypes(infoRes.data.notetypes);
      return infoRes.data;
    }
    return null;
  }, []);

  const loadFields = useCallback(async (notetypeId: number) => {
    const res = await sendMsg<{ success: boolean; data?: string[] }>("ankiGetNotetypeFields", { notetypeId });
    if (res.success && res.data) setFields(res.data);
  }, []);

  useEffect(() => {
    const init = async () => {
      const statusRes = await sendMsg<{ success: boolean; data?: { loggedIn: boolean; email: string | null } }>("ankiGetStatus");

      let info: InfoData | null = null;
      if (statusRes.data?.loggedIn && statusRes.data.email) {
        setConnectedEmail(statusRes.data.email);
        info = await loadInfo();
      }

      const stored = await get<AnkiSettings>("ankiSettings", "sync");
      let s = stored ?? DEFAULT_SETTINGS;

      // Discard stored IDs that don't match any live data — they were likely
      // corrupted by a previous varint bug and would cause 422 errors.
      if (info) {
        const validDeck = info.decks.some(d => d.id === s.deckId);
        const validNotetype = info.notetypes.some(n => n.id === s.notetypeId);
        if (!validDeck) s = { ...s, deckId: null };
        if (!validNotetype) s = { ...s, notetypeId: null, frontFieldIndex: 0, backFieldIndex: 1 };
      }

      setSettings(s);

      if (statusRes.data?.loggedIn && s.notetypeId) {
        await loadFields(s.notetypeId);
      }

      await loadHistory();
    };
    init();
  }, [get, loadInfo, loadFields, loadHistory]);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    const res = await sendMsg<{ success: boolean; error?: string }>("ankiLogin", { email, password });
    if (res.success) {
      setConnectedEmail(email);
      setEmail("");
      setPassword("");
      await loadInfo();
    } else {
      setError(res.error ?? t("errors.loginFailed", { ns: "sync" }));
    }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    await sendMsg("ankiLogout");
    setConnectedEmail(null);
    setDecks([]);
    setNotetypes([]);
    setFields([]);
    setSettings(DEFAULT_SETTINGS);
  };

  const handleNotetypeChange = async (notetypeId: number) => {
    setSettings((s) => ({ ...s, notetypeId, frontFieldIndex: 0, backFieldIndex: 1 }));
    setFields([]);
    await loadFields(notetypeId);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await sendMsg<{ success: boolean; error?: string }>("ankiTestCard", { front: "hover-translate test", back: "hover-translate test" });
    setTestResult(res);
    setTesting(false);
    if (res.success) await loadHistory();
  };

  const handleSave = async () => {
    await set("ankiSettings", settings, "sync");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Page title={t("pageTitle", { ns: "sync" })}>
      <Stack spacing={2}>
        {!connectedEmail ? (
          <Stack spacing={2}>
            <TextField
              label={t("login.email", { ns: "sync" })}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              size="small"
              fullWidth
              disabled={connecting}
            />
            <TextField
              label={t("login.password", { ns: "sync" })}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              size="small"
              fullWidth
              disabled={connecting}
            />
            {error && (
              <Typography variant="caption" color="error">{error}</Typography>
            )}
            <Button
              variant="contained"
              onClick={handleConnect}
              disabled={connecting || !email || !password}
              startIcon={connecting ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {connecting ? t("login.connecting", { ns: "sync" }) : t("login.connect", { ns: "sync" })}
            </Button>
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Box>
              <Chip
                label={`${t("status.connected", { ns: "sync" })}: ${connectedEmail}`}
                color="success"
                size="small"
              />
            </Box>

            <FormControl size="small" fullWidth>
              <InputLabel>{t("settings.deck", { ns: "sync" })}</InputLabel>
              <Select
                label={t("settings.deck", { ns: "sync" })}
                value={settings.deckId ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, deckId: e.target.value as number }))}
              >
                {decks.map((d) => (
                  <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel>{t("settings.notetype", { ns: "sync" })}</InputLabel>
              <Select
                label={t("settings.notetype", { ns: "sync" })}
                value={settings.notetypeId ?? ""}
                onChange={(e) => handleNotetypeChange(e.target.value as number)}
              >
                {notetypes.map((n) => (
                  <MenuItem key={n.id} value={n.id}>{n.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth disabled={fields.length === 0}>
              <InputLabel>{t("settings.frontField", { ns: "sync" })}</InputLabel>
              <Select
                label={t("settings.frontField", { ns: "sync" })}
                value={fields.length > 0 ? settings.frontFieldIndex : ""}
                onChange={(e) => setSettings((s) => ({ ...s, frontFieldIndex: e.target.value as number }))}
              >
                {fields.map((f, i) => (
                  <MenuItem key={i} value={i}>{f}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth disabled={fields.length === 0}>
              <InputLabel>{t("settings.backField", { ns: "sync" })}</InputLabel>
              <Select
                label={t("settings.backField", { ns: "sync" })}
                value={fields.length > 0 ? settings.backFieldIndex : ""}
                onChange={(e) => setSettings((s) => ({ ...s, backFieldIndex: e.target.value as number }))}
              >
                {fields.map((f, i) => (
                  <MenuItem key={i} value={i}>{f}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControlLabel
              control={
                <Switch
                  checked={settings.enabled}
                  onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
                />
              }
              label={t("settings.autoSync", { ns: "sync" })}
            />

            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button variant="contained" onClick={handleSave}>
                {saved ? t("settings.saved", { ns: "sync" }) : t("settings.save", { ns: "sync" })}
              </Button>
              <Button
                variant="outlined"
                onClick={handleTest}
                disabled={testing || !settings.deckId || !settings.notetypeId}
                startIcon={testing ? <CircularProgress size={14} color="inherit" /> : undefined}
              >
                {t("settings.testCard", { ns: "sync" })}
              </Button>
              <Button variant="outlined" color="warning" onClick={handleDisconnect}>
                {t("disconnect", { ns: "sync" })}
              </Button>
            </Stack>

            {testResult && (
              <Typography variant="caption" color={testResult.success ? "success.main" : "error"}>
                {testResult.success
                  ? t("settings.testSuccess", { ns: "sync" })
                  : `${t("settings.testFailed", { ns: "sync" })}: ${testResult.error}`}
              </Typography>
            )}

            {history.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                  {t("history.title", { ns: "sync" })}
                </Typography>
                <Stack spacing={0.5} sx={{ maxHeight: 180, overflowY: "auto" }}>
                  {history.map((entry, i) => (
                    <Box
                      key={i}
                      sx={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 1,
                        px: 1,
                        py: 0.25,
                        borderRadius: 1,
                        bgcolor: entry.success ? "success.main" : "error.main",
                        opacity: 0.85,
                      }}
                    >
                      <Typography variant="caption" sx={{ color: "common.white", flexShrink: 0 }}>
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "common.white", fontWeight: 600 }}>
                        {entry.front}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "common.white" }}>
                        → {entry.back}
                      </Typography>
                      {entry.error && (
                        <Typography variant="caption" sx={{ color: "common.white", ml: "auto" }}>
                          {entry.error}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </Stack>
    </Page>
  );
};

export default SyncPage;
