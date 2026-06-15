import { FC, useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Page } from "@/shared/ui/Page/Page.tsx";
import { useStorage } from "@/shared/lib/hooks/useStorage.ts";
import { DebugConfig, DebugData, defaultDebugConfig } from "@shared/types/debug.ts";

const SUBTITLE_POLL_MS = 1500;

const getDebugData = (): Promise<DebugData> =>
  new Promise((resolve) =>
    chrome.runtime.sendMessage({ action: "getDebugData" }, (res) =>
      resolve(res?.debugData ?? { snapshot: null, subtitleEvents: [] }),
    ),
  );

const DebugPage: FC = () => {
  const { get, set } = useStorage();

  const [config, setConfig] = useState<DebugConfig>(defaultDebugConfig);
  const [activeTab, setActiveTab] = useState<"feed" | "structure" | "dom">("feed");
  const [eventCount, setEventCount] = useState(0);
  const [capturing, setCapturing] = useState(false);

  // Refs keep textareas stable — no re-mount on data update
  const feedRef = useRef<HTMLTextAreaElement>(null);
  const structureRef = useRef<HTMLTextAreaElement>(null);
  const domRef = useRef<HTMLTextAreaElement>(null);

  const applyData = useCallback((data: DebugData) => {
    if (feedRef.current) {
      const lines = data.subtitleEvents.map((ev) => {
        const time = new Date(ev.timestamp).toLocaleTimeString();
        return `[${time}]  ${ev.texts.join(" | ")}\n\n${ev.html}`;
      });
      feedRef.current.value = lines.length
        ? lines.join("\n\n---\n\n")
        : "(no subtitle events yet — enable debug mode and set a selector)";
    }
    if (structureRef.current && data.snapshot) {
      structureRef.current.value =
        data.snapshot.scopedHtml || "(selector matched nothing — check the selector)";
    }
    if (domRef.current && data.snapshot) {
      domRef.current.value = data.snapshot.html;
    }
    setEventCount(data.subtitleEvents.length);
  }, []);

  // Poll only for subtitle events (lightweight)
  const pollSubtitleEvents = useCallback(async () => {
    const data = await getDebugData();
    applyData(data);
  }, [applyData]);

  useEffect(() => {
    get<DebugConfig>("debugConfig", "local").then((stored) => {
      if (stored) setConfig(stored);
    });
    pollSubtitleEvents();
    const id = setInterval(pollSubtitleEvents, SUBTITLE_POLL_MS);
    return () => clearInterval(id);
  }, [get, pollSubtitleEvents]);

  const msg = (action: string): Promise<void> =>
    new Promise((r) => chrome.runtime.sendMessage({ action }, () => r()));

  const saveConfig = useCallback(
    async (updated: DebugConfig) => {
      setConfig(updated);
      await set("debugConfig", updated, "local");
    },
    [set],
  );

  const handleCapture = useCallback(async () => {
    setCapturing(true);
    await msg("captureDebugSnapshot");
    const data = await getDebugData();
    applyData(data);
    setCapturing(false);
    setActiveTab("structure");
  }, [applyData]);

  const handleClear = async () => {
    await new Promise<void>((r) =>
      chrome.runtime.sendMessage({ action: "clearDebugData" }, () => r()),
    );
    if (feedRef.current) feedRef.current.value = "";
    if (structureRef.current) structureRef.current.value = "";
    if (domRef.current) domRef.current.value = "";
    setEventCount(0);
  };

  const handleCopy = () => {
    const el =
      activeTab === "feed"
        ? feedRef.current
        : activeTab === "structure"
          ? structureRef.current
          : domRef.current;
    if (el) navigator.clipboard.writeText(el.value).catch(() => {});
  };

  const handleToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const updated = { ...config, enabled: e.target.checked };
    await saveConfig(updated);
    await msg(updated.enabled ? "startDebugObserver" : "stopDebugObserver");
  };

  const handleSelectorChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setConfig((c) => ({ ...c, subtitleSelector: e.target.value }));

  const handleSelectorCommit = async () => {
    await saveConfig(config);
    if (config.enabled) await msg("startDebugObserver"); // restart observer with new selector
  };

  const handleSelectorKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSelectorCommit();
  };

  const tabs = [
    {
      id: "feed" as const,
      label: "Live subtitle feed",
      hint: "Real-time text from subtitle elements as they change",
    },
    {
      id: "structure" as const,
      label: "Selector HTML",
      hint: "HTML structure around the matched selector — captures on button press",
    },
    {
      id: "dom" as const,
      label: "Full DOM",
      hint: "Entire page HTML (truncated) — useful before you have a working selector",
    },
  ];

  return (
    <Page title="Debug Inspector">
      <Stack spacing={2}>
        <Box>
          <FormControlLabel
            control={<Switch checked={config.enabled} onChange={handleToggle} />}
            label="Enable debug mode"
          />
          <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4 }}>
            Activates subtitle monitoring on the active tab. DOM snapshots are captured on demand.
          </Typography>
        </Box>

        <TextField
          label="Subtitle CSS selector"
          placeholder="e.g. .ytp-caption-segment"
          helperText="Press Enter or click away to save. Used for both the live feed and selector HTML capture."
          value={config.subtitleSelector}
          onChange={handleSelectorChange}
          onBlur={handleSelectorCommit}
          onKeyDown={handleSelectorKeyDown}
          size="small"
          fullWidth
          disabled={!config.enabled}
        />

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button
            size="small"
            variant="contained"
            onClick={handleCapture}
            disabled={!config.enabled || capturing}
            startIcon={capturing ? <CircularProgress size={12} color="inherit" /> : undefined}
          >
            {capturing ? "Capturing…" : "Capture snapshot"}
          </Button>
          <Button size="small" variant="outlined" onClick={handleCopy}>Copy</Button>
          <Button size="small" variant="outlined" color="warning" onClick={handleClear}>Clear</Button>
          {eventCount > 0 && (
            <Chip size="small" label={`${eventCount} events`} color="success" />
          )}
        </Stack>

        <Divider />

        <Stack direction="row" spacing={1}>
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              size="small"
              variant={activeTab === tab.id ? "contained" : "outlined"}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </Stack>

        <Typography variant="caption" color="text.secondary">
          {tabs.find((t) => t.id === activeTab)?.hint}
        </Typography>

        {/* All textareas always in DOM — hidden via display:none to preserve content and scroll */}
        {tabs.map((tab) => (
          <Box key={tab.id} sx={{ display: activeTab === tab.id ? "block" : "none" }}>
            <Box
              component="textarea"
              ref={tab.id === "feed" ? feedRef : tab.id === "structure" ? structureRef : domRef}
              readOnly
              defaultValue=""
              sx={{
                width: "100%",
                height: 320,
                fontFamily: "monospace",
                fontSize: "11px",
                resize: "vertical",
                boxSizing: "border-box",
                p: 1,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                backgroundColor: "background.paper",
                color: "text.primary",
              }}
            />
          </Box>
        ))}
      </Stack>
    </Page>
  );
};

export default DebugPage;