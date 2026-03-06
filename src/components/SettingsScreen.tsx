import { useState, useEffect, useCallback } from 'react';
import GithubStarPill from './GithubStarPill';
import { ConfirmRequest } from '../types';
import ApiKeysPanel, { ApiKeyConfig, ProviderConfig } from './settings/ApiKeysPanel';
import StoragePanel from './settings/StoragePanel';
import CapturesPanel from './settings/CapturesPanel';
import CookiesPanel from './settings/CookiesPanel';
import SettingsHeader from './settings/SettingsHeader';
import ProxiesPanel from './settings/ProxiesPanel';
import UserAgentPanel from './settings/UserAgentPanel';
import VersionPanel from './settings/VersionPanel';
import { APP_VERSION } from '@/utils/appInfo';

interface SettingsScreenProps {
    onClearStorage: (type: 'screenshots' | 'cookies') => void;
    onConfirm: (request: string | ConfirmRequest) => Promise<boolean>;
    onNotify: (message: string, tone?: 'success' | 'error') => void;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({
    onClearStorage,
    onConfirm,
    onNotify
}) => {
    const [tab, setTab] = useState<'system' | 'data' | 'proxies'>('system');
    const [addedProviders, setAddedProviders] = useState<string[]>([]);
    const [captures, setCaptures] = useState<{ name: string; url: string; size: number; modified: number; type: 'screenshot' | 'recording' }[]>([]);
    const [cookies, setCookies] = useState<{ name: string; value: string; domain?: string; path?: string; expires?: number }[]>([]);
    const [cookieOrigins, setCookieOrigins] = useState<any[]>([]);
    const [dataLoading, setDataLoading] = useState(false);
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [apiKeyLoading, setApiKeyLoading] = useState(true);
    const [apiKeySaving, setApiKeySaving] = useState(false);
    const [geminiApiKeys, setGeminiApiKeys] = useState<string[]>([]);
    const [geminiApiKeyLoading, setGeminiApiKeyLoading] = useState(true);
    const [geminiApiKeySaving, setGeminiApiKeySaving] = useState(false);
    const [openAiApiKeys, setOpenAiApiKeys] = useState<string[]>([]);
    const [openAiApiKeyLoading, setOpenAiApiKeyLoading] = useState(true);
    const [openAiApiKeySaving, setOpenAiApiKeySaving] = useState(false);
    const [claudeApiKeys, setClaudeApiKeys] = useState<string[]>([]);
    const [claudeApiKeyLoading, setClaudeApiKeyLoading] = useState(true);
    const [claudeApiKeySaving, setClaudeApiKeySaving] = useState(false);
    const [proxies, setProxies] = useState<{ id: string; server: string; username?: string; password?: string; label?: string; isRotatingPool?: boolean; estimatedPoolSize?: number }[]>([]);
    const [defaultProxyId, setDefaultProxyId] = useState<string | null>(null);
    const [includeDefaultInRotation, setIncludeDefaultInRotation] = useState(false);
    const [rotationMode, setRotationMode] = useState<'round-robin' | 'random'>('round-robin');
    const [proxiesLoading, setProxiesLoading] = useState(false);
    const [userAgentSelection, setUserAgentSelection] = useState('system');
    const [userAgentOptions, setUserAgentOptions] = useState<string[]>([]);
    const [userAgentLoading, setUserAgentLoading] = useState(false);

    const loadData = useCallback(async () => {
        setDataLoading(true);
        try {
            const [capturesRes, cookiesRes] = await Promise.all([
                fetch('/api/data/captures'),
                fetch('/api/data/cookies')
            ]);
            const capturesData = capturesRes.ok ? await capturesRes.json() : { captures: [] };
            const cookiesData = cookiesRes.ok ? await cookiesRes.json() : { cookies: [], origins: [] };
            setCaptures(Array.isArray(capturesData.captures) ? capturesData.captures : []);
            setCookies(Array.isArray(cookiesData.cookies) ? cookiesData.cookies : []);
            setCookieOrigins(Array.isArray(cookiesData.origins) ? cookiesData.origins : []);
        } catch {
            setCaptures([]);
            setCookies([]);
            setCookieOrigins([]);
        } finally {
            setDataLoading(false);
        }
    }, []);

    const deleteCapture = useCallback(async (name: string) => {
        const confirmed = await onConfirm(`Delete capture ${name}?`);
        if (!confirmed) return;
        const res = await fetch(`/api/data/captures/${encodeURIComponent(name)}`, { method: 'DELETE' });
        if (res.ok) {
            onNotify('Capture deleted.', 'success');
            loadData();
        } else {
            onNotify('Delete failed.', 'error');
        }
    }, [onConfirm, onNotify, loadData]);

    const deleteCookie = useCallback(async (cookie: { name: string; domain?: string; path?: string }) => {
        const confirmed = await onConfirm(`Delete cookie ${cookie.name}?`);
        if (!confirmed) return;
        const res = await fetch('/api/data/cookies/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: cookie.name, domain: cookie.domain, path: cookie.path })
        });
        if (res.ok) {
            onNotify('Cookie deleted.', 'success');
            loadData();
        } else {
            onNotify('Delete failed.', 'error');
        }
    }, [onConfirm, onNotify, loadData]);

    const loadApiKey = async () => {
        setApiKeyLoading(true);
        try {
            const res = await fetch('/api/settings/api-key', { credentials: 'include' });
            if (!res.ok) {
                if (res.status === 401) {
                    onNotify('Session expired. Please log in again.', 'error');
                }
                setApiKey(null);
                return;
            }
            const data = await res.json();
            setApiKey(data.apiKey || null);
        } catch {
            setApiKey(null);
        } finally {
            setApiKeyLoading(false);
        }
    };

    const loadGeminiApiKeys = async () => {
        setGeminiApiKeyLoading(true);
        try {
            const res = await fetch('/api/settings/gemini-api-key', { credentials: 'include' });
            if (!res.ok) {
                if (res.status === 401) {
                    onNotify('Session expired. Please log in again.', 'error');
                }
                setGeminiApiKeys([]);
                return;
            }
            const data = await res.json();
            setGeminiApiKeys(Array.isArray(data.geminiApiKeys) ? data.geminiApiKeys : []);
        } catch {
            setGeminiApiKeys([]);
        } finally {
            setGeminiApiKeyLoading(false);
        }
    };

    const loadOpenAiApiKeys = async () => {
        setOpenAiApiKeyLoading(true);
        try {
            const res = await fetch('/api/settings/openai-api-key', { credentials: 'include' });
            if (!res.ok) {
                if (res.status === 401) {
                    onNotify('Session expired. Please log in again.', 'error');
                }
                setOpenAiApiKeys([]);
                return;
            }
            const data = await res.json();
            setOpenAiApiKeys(Array.isArray(data.openAiApiKeys) ? data.openAiApiKeys : []);
        } catch {
            setOpenAiApiKeys([]);
        } finally {
            setOpenAiApiKeyLoading(false);
        }
    };

    const loadClaudeApiKeys = async () => {
        setClaudeApiKeyLoading(true);
        try {
            const res = await fetch('/api/settings/claude-api-key', { credentials: 'include' });
            if (!res.ok) {
                if (res.status === 401) {
                    onNotify('Session expired. Please log in again.', 'error');
                }
                setClaudeApiKeys([]);
                return;
            }
            const data = await res.json();
            setClaudeApiKeys(Array.isArray(data.claudeApiKeys) ? data.claudeApiKeys : []);
        } catch {
            setClaudeApiKeys([]);
        } finally {
            setClaudeApiKeyLoading(false);
        }
    };

    const loadProxies = async () => {
        setProxiesLoading(true);
        try {
            const res = await fetch('/api/settings/proxies', { credentials: 'include' });
            if (!res.ok) {
                if (res.status === 401) {
                    onNotify('Session expired. Please log in again.', 'error');
                }
                setProxies([]);
                setDefaultProxyId(null);
                setRotationMode('round-robin');
                return;
            }
            const data = await res.json();
            setProxies(Array.isArray(data.proxies) ? data.proxies : []);
            setDefaultProxyId(data.defaultProxyId || null);
            setIncludeDefaultInRotation(!!data.includeDefaultInRotation);
            setRotationMode(data.rotationMode === 'random' ? 'random' : 'round-robin');
        } catch {
            setProxies([]);
            setDefaultProxyId(null);
            setIncludeDefaultInRotation(false);
            setRotationMode('round-robin');
        } finally {
            setProxiesLoading(false);
        }
    };

    const addProxy = async (entry: { server: string; username?: string; password?: string; label?: string; isRotatingPool?: boolean; estimatedPoolSize?: number }) => {
        setProxiesLoading(true);
        try {
            const res = await fetch('/api/settings/proxies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(entry)
            });
            if (!res.ok) {
                let detail = '';
                try {
                    const data = await res.json();
                    detail = data?.error || data?.message || '';
                } catch {
                    detail = '';
                }
                onNotify(`Failed to add proxy${detail ? `: ${detail}` : ''}.`, 'error');
                return;
            }
            const data = await res.json();
            setProxies(Array.isArray(data.proxies) ? data.proxies : []);
            setDefaultProxyId(data.defaultProxyId || null);
            setIncludeDefaultInRotation(!!data.includeDefaultInRotation);
            setRotationMode(data.rotationMode === 'random' ? 'random' : 'round-robin');
            onNotify('Proxy added.', 'success');
        } catch {
            onNotify('Failed to add proxy.', 'error');
        } finally {
            setProxiesLoading(false);
        }
    };

    const loadUserAgent = async () => {
        setUserAgentLoading(true);
        try {
            const res = await fetch('/api/settings/user-agent', { credentials: 'include' });
            if (!res.ok) {
                if (res.status === 401) {
                    onNotify('Session expired. Please log in again.', 'error');
                }
                setUserAgentSelection('system');
                setUserAgentOptions([]);
                return;
            }
            const data = await res.json();
            setUserAgentSelection(data.selection === 'system' ? 'system' : String(data.selection || 'system'));
            setUserAgentOptions(Array.isArray(data.userAgents) ? data.userAgents : []);
        } catch {
            setUserAgentSelection('system');
            setUserAgentOptions([]);
        } finally {
            setUserAgentLoading(false);
        }
    };

    const saveUserAgent = async (selection: string) => {
        setUserAgentLoading(true);
        try {
            const res = await fetch('/api/settings/user-agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ selection })
            });
            if (!res.ok) {
                onNotify('Failed to update user agent.', 'error');
                return;
            }
            const data = await res.json();
            setUserAgentSelection(data.selection === 'system' ? 'system' : String(data.selection || 'system'));
            setUserAgentOptions(Array.isArray(data.userAgents) ? data.userAgents : []);
            onNotify('User agent updated.', 'success');
        } catch {
            onNotify('Failed to update user agent.', 'error');
        } finally {
            setUserAgentLoading(false);
        }
    };

    const importProxies = async (entries: { server: string; username?: string; password?: string; label?: string; isRotatingPool?: boolean; estimatedPoolSize?: number }[]) => {
        if (!entries.length) {
            onNotify('No valid proxies found in file.', 'error');
            return;
        }
        setProxiesLoading(true);
        try {
            const res = await fetch('/api/settings/proxies/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ proxies: entries })
            });
            if (!res.ok) {
                let detail = '';
                try {
                    const data = await res.json();
                    detail = data?.error || data?.message || '';
                } catch {
                    detail = '';
                }
                onNotify(`Failed to import proxies${detail ? `: ${detail}` : ''}.`, 'error');
                return;
            }
            const data = await res.json();
            setProxies(Array.isArray(data.proxies) ? data.proxies : []);
            setDefaultProxyId(data.defaultProxyId || null);
            setIncludeDefaultInRotation(!!data.includeDefaultInRotation);
            setRotationMode(data.rotationMode === 'random' ? 'random' : 'round-robin');
            onNotify('Proxies imported.', 'success');
        } catch {
            onNotify('Failed to import proxies.', 'error');
        } finally {
            setProxiesLoading(false);
        }
    };

    const updateProxy = async (id: string, entry: { server: string; username?: string; password?: string; label?: string; isRotatingPool?: boolean; estimatedPoolSize?: number }) => {
        setProxiesLoading(true);
        try {
            const res = await fetch(`/api/settings/proxies/${encodeURIComponent(id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(entry)
            });
            if (!res.ok) {
                let detail = '';
                try {
                    const data = await res.json();
                    detail = data?.error || data?.message || '';
                } catch {
                    detail = '';
                }
                onNotify(`Failed to update proxy${detail ? `: ${detail}` : ''}.`, 'error');
                return;
            }
            const data = await res.json();
            setProxies(Array.isArray(data.proxies) ? data.proxies : []);
            setDefaultProxyId(data.defaultProxyId || null);
            setIncludeDefaultInRotation(!!data.includeDefaultInRotation);
            setRotationMode(data.rotationMode === 'random' ? 'random' : 'round-robin');
            onNotify('Proxy updated.', 'success');
        } catch {
            onNotify('Failed to update proxy.', 'error');
        } finally {
            setProxiesLoading(false);
        }
    };

    const deleteProxy = async (id: string) => {
        if (id === 'host') return;
        const confirmed = await onConfirm('Delete this proxy?');
        if (!confirmed) return;
        setProxiesLoading(true);
        try {
            const res = await fetch(`/api/settings/proxies/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            if (!res.ok) {
                onNotify('Delete failed.', 'error');
                return;
            }
            const data = await res.json();
            setProxies(Array.isArray(data.proxies) ? data.proxies : []);
            setDefaultProxyId(data.defaultProxyId || null);
            setIncludeDefaultInRotation(!!data.includeDefaultInRotation);
            setRotationMode(data.rotationMode === 'random' ? 'random' : 'round-robin');
            onNotify('Proxy deleted.', 'success');
        } catch {
            onNotify('Delete failed.', 'error');
        } finally {
            setProxiesLoading(false);
        }
    };

    const deleteProxies = async (ids: string[]) => {
        if (ids.length === 0) return;
        const confirmed = await onConfirm(`Delete ${ids.length} proxies?`);
        if (!confirmed) return;
        setProxiesLoading(true);
        try {
            const res = await fetch('/api/settings/proxies', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ ids })
            });
            if (!res.ok) {
                onNotify('Bulk delete failed.', 'error');
                return;
            }
            const data = await res.json();
            setProxies(Array.isArray(data.proxies) ? data.proxies : []);
            setDefaultProxyId(data.defaultProxyId || null);
            setIncludeDefaultInRotation(!!data.includeDefaultInRotation);
            setRotationMode(data.rotationMode === 'random' ? 'random' : 'round-robin');
            onNotify(`${ids.length} proxies deleted.`, 'success');
        } catch {
            onNotify('Bulk delete failed.', 'error');
        } finally {
            setProxiesLoading(false);
        }
    };

    const setDefaultProxy = async (id: string | null) => {
        const normalized = id === 'host' ? null : id;
        setProxiesLoading(true);
        try {
            const res = await fetch('/api/settings/proxies/default', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: normalized })
            });
            if (!res.ok) {
                onNotify('Failed to set default.', 'error');
                return;
            }
            const data = await res.json();
            setProxies(Array.isArray(data.proxies) ? data.proxies : []);
            setDefaultProxyId(data.defaultProxyId || null);
            setIncludeDefaultInRotation(!!data.includeDefaultInRotation);
            setRotationMode(data.rotationMode === 'random' ? 'random' : 'round-robin');
            onNotify('Default proxy updated.', 'success');
        } catch {
            onNotify('Failed to set default.', 'error');
        } finally {
            setProxiesLoading(false);
        }
    };

    const toggleIncludeDefaultInRotation = async (enabled: boolean) => {
        setProxiesLoading(true);
        try {
            const res = await fetch('/api/settings/proxies/rotation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ includeDefaultInRotation: enabled })
            });
            if (!res.ok) {
                onNotify('Failed to update rotation setting.', 'error');
                return;
            }
            const data = await res.json();
            setProxies(Array.isArray(data.proxies) ? data.proxies : []);
            setDefaultProxyId(data.defaultProxyId || null);
            setIncludeDefaultInRotation(!!data.includeDefaultInRotation);
            setRotationMode(data.rotationMode === 'random' ? 'random' : 'round-robin');
            onNotify('Rotation setting updated.', 'success');
        } catch {
            onNotify('Failed to update rotation setting.', 'error');
        } finally {
            setProxiesLoading(false);
        }
    };

    const updateRotationMode = async (mode: 'round-robin' | 'random') => {
        setProxiesLoading(true);
        try {
            const res = await fetch('/api/settings/proxies/rotation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ rotationMode: mode })
            });
            if (!res.ok) {
                onNotify('Failed to update rotation mode.', 'error');
                return;
            }
            const data = await res.json();
            setProxies(Array.isArray(data.proxies) ? data.proxies : []);
            setDefaultProxyId(data.defaultProxyId || null);
            setIncludeDefaultInRotation(!!data.includeDefaultInRotation);
            setRotationMode(data.rotationMode === 'random' ? 'random' : 'round-robin');
            onNotify('Rotation mode updated.', 'success');
        } catch {
            onNotify('Failed to update rotation mode.', 'error');
        } finally {
            setProxiesLoading(false);
        }
    };

    const regenerateApiKey = async () => {
        setApiKeySaving(true);
        try {
            const res = await fetch('/api/settings/api-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });
            if (!res.ok) {
                let detail = '';
                try {
                    const data = await res.json();
                    detail = data?.error || data?.message || '';
                } catch {
                    detail = '';
                }
                if (res.status === 401) {
                    onNotify('Session expired. Please log in again.', 'error');
                } else {
                    onNotify(`Failed to generate API key${detail ? `: ${detail}` : ''}.`, 'error');
                }
                return;
            }
            const data = await res.json();
            setApiKey(data.apiKey || null);
            onNotify('API key generated.', 'success');
        } catch {
            onNotify('Failed to generate API key.', 'error');
        } finally {
            setApiKeySaving(false);
        }
    };

    const saveGeminiApiKeys = async (newKeys: string[]) => {
        setGeminiApiKeySaving(true);
        try {
            const res = await fetch('/api/settings/gemini-api-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ geminiApiKeys: newKeys })
            });
            if (!res.ok) {
                if (res.status === 401) {
                    onNotify('Session expired. Please log in again.', 'error');
                } else {
                    onNotify('Failed to save Gemini API keys.', 'error');
                }
                return;
            }
            const data = await res.json();
            setGeminiApiKeys(Array.isArray(data.geminiApiKeys) ? data.geminiApiKeys : []);
            onNotify('Gemini API keys saved.', 'success');
        } catch {
            onNotify('Failed to save Gemini API keys.', 'error');
        } finally {
            setGeminiApiKeySaving(false);
        }
    };

    const saveOpenAiApiKeys = async (newKeys: string[]) => {
        setOpenAiApiKeySaving(true);
        try {
            const res = await fetch('/api/settings/openai-api-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ openAiApiKeys: newKeys })
            });
            if (!res.ok) {
                if (res.status === 401) {
                    onNotify('Session expired. Please log in again.', 'error');
                } else {
                    onNotify('Failed to save OpenAI API keys.', 'error');
                }
                return;
            }
            const data = await res.json();
            setOpenAiApiKeys(Array.isArray(data.openAiApiKeys) ? data.openAiApiKeys : []);
            onNotify('OpenAI API keys saved.', 'success');
        } catch {
            onNotify('Failed to save OpenAI API keys.', 'error');
        } finally {
            setOpenAiApiKeySaving(false);
        }
    };

    const saveClaudeApiKeys = async (newKeys: string[]) => {
        setClaudeApiKeySaving(true);
        try {
            const res = await fetch('/api/settings/claude-api-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ claudeApiKeys: newKeys })
            });
            if (!res.ok) {
                if (res.status === 401) {
                    onNotify('Session expired. Please log in again.', 'error');
                } else {
                    onNotify('Failed to save Claude API keys.', 'error');
                }
                return;
            }
            const data = await res.json();
            setClaudeApiKeys(Array.isArray(data.claudeApiKeys) ? data.claudeApiKeys : []);
            onNotify('Claude API keys saved.', 'success');
        } catch {
            onNotify('Failed to save Claude API keys.', 'error');
        } finally {
            setClaudeApiKeySaving(false);
        }
    };

    // Load system data on mount and when tab changes to system
    useEffect(() => {
        if (tab === 'data') loadData();
        if (tab === 'system') {
            loadApiKey();
            loadGeminiApiKeys();
            loadOpenAiApiKeys();
            loadClaudeApiKeys();
            loadUserAgent();
        }
        if (tab === 'proxies') loadProxies();
    }, [tab]);

    // Also load system keys on initial mount in case tab is already 'system'
    useEffect(() => {
        if (tab === 'system') {
            loadApiKey();
            loadGeminiApiKeys();
            loadOpenAiApiKeys();
            loadClaudeApiKeys();
        }
    }, []);

    const availableProviders: ProviderConfig[] = [
        {
            id: 'gemini_api_key',
            name: 'Gemini API Key',
            iconUrl: 'https://www.google.com/s2/favicons?domain=gemini.google.com&sz=128',
            disabled: false
        },
        {
            id: 'anthropic_api_key',
            name: 'Anthropic API Key',
            iconUrl: 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/claude.svg',
            disabled: false
        },
        {
            id: 'openai_api_key',
            name: 'OpenAI API Key',
            iconUrl: 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/openai.svg',
            disabled: false
        },
        {
            id: 'ollama_api_key',
            name: 'Ollama API Key',
            iconUrl: 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/ollama.svg',
            disabled: true
        }
    ];

    const apiKeysConfig: ApiKeyConfig[] = [
        {
            id: 'doppelganger_api_key',
            name: 'Tasks API',
            description: 'Manage task API access via `x-api-key` header',
            icon: 'database',
            value: apiKey,
            saving: apiKeySaving,
            loading: apiKeyLoading,
            showCopyButton: true,
            readOnly: true,
            onSave: async () => { }, // Not used directly for save, we use regenerate
            onRegenerate: async () => { await regenerateApiKey(); }
        }
    ];

    const validGeminiKeys = geminiApiKeys.filter(k => k && k.trim());
    validGeminiKeys.forEach((keyVal, idx) => {
        apiKeysConfig.push({
            id: `gemini_api_key_${idx}`,
            name: `Gemini API Key`,
            description: 'Provide an API Key from Google AI Studio for AI features',
            iconUrl: 'https://www.google.com/s2/favicons?domain=gemini.google.com&sz=128',
            value: keyVal,
            saving: geminiApiKeySaving,
            loading: geminiApiKeyLoading,
            badge: idx === 0 ? 'Primary' : 'Backup',
            onSave: async (val) => {
                const newKeys = [...geminiApiKeys];
                newKeys[idx] = val;
                await saveGeminiApiKeys(newKeys);
            },
            onDelete: async () => {
                const newKeys = geminiApiKeys.filter((_, i) => i !== idx);
                await saveGeminiApiKeys(newKeys);
            }
        });
    });

    const validOpenAiKeys = openAiApiKeys.filter(k => k && k.trim());
    validOpenAiKeys.forEach((keyVal, idx) => {
        apiKeysConfig.push({
            id: `openai_api_key_${idx}`,
            name: `OpenAI API Key`,
            description: 'Provide an API Key from OpenAI for AI features',
            iconUrl: 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/openai.svg',
            value: keyVal,
            saving: openAiApiKeySaving,
            loading: openAiApiKeyLoading,
            badge: idx === 0 ? 'Primary' : 'Backup',
            onSave: async (val) => {
                const newKeys = [...openAiApiKeys];
                newKeys[idx] = val;
                await saveOpenAiApiKeys(newKeys);
            },
            onDelete: async () => {
                const newKeys = openAiApiKeys.filter((_, i) => i !== idx);
                await saveOpenAiApiKeys(newKeys);
            }
        });
    });

    const validClaudeKeys = claudeApiKeys.filter(k => k && k.trim());
    validClaudeKeys.forEach((keyVal, idx) => {
        apiKeysConfig.push({
            id: `anthropic_api_key_${idx}`,
            name: `Anthropic API Key`,
            description: 'Provide an API Key from Anthropic for AI features',
            iconUrl: 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/claude.svg',
            value: keyVal,
            saving: claudeApiKeySaving,
            loading: claudeApiKeyLoading,
            badge: idx === 0 ? 'Primary' : 'Backup',
            onSave: async (val) => {
                const newKeys = [...claudeApiKeys];
                newKeys[idx] = val;
                await saveClaudeApiKeys(newKeys);
            },
            onDelete: async () => {
                const newKeys = claudeApiKeys.filter((_, i) => i !== idx);
                await saveClaudeApiKeys(newKeys);
            }
        });
    });

    const numUnsavedGemini = addedProviders.filter(p => p === 'gemini_api_key').length;
    for (let i = 0; i < numUnsavedGemini; i++) {
        apiKeysConfig.push({
            id: `gemini_api_key_unsaved_${i}`,
            name: `Gemini API Key`,
            description: 'Provide an API Key from Google AI Studio for AI features',
            iconUrl: 'https://www.google.com/s2/favicons?domain=gemini.google.com&sz=128',
            value: null,
            saving: geminiApiKeySaving,
            loading: geminiApiKeyLoading,
            startEditing: true,
            onSave: async (val) => {
                const newKeys = [...geminiApiKeys, val];
                await saveGeminiApiKeys(newKeys);
                setAddedProviders(prev => {
                    const idx = prev.indexOf('gemini_api_key');
                    if (idx !== -1) {
                        const next = [...prev];
                        next.splice(idx, 1);
                        return next;
                    }
                    return prev;
                });
            },
            onDelete: async () => {
                setAddedProviders(prev => {
                    const idx = prev.indexOf('gemini_api_key');
                    if (idx !== -1) {
                        const next = [...prev];
                        next.splice(idx, 1);
                        return next;
                    }
                    return prev;
                });
            }
        });
    }

    const numUnsavedOpenAi = addedProviders.filter(p => p === 'openai_api_key').length;
    for (let i = 0; i < numUnsavedOpenAi; i++) {
        apiKeysConfig.push({
            id: `openai_api_key_unsaved_${i}`,
            name: `OpenAI API Key`,
            description: 'Provide an API Key from OpenAI for AI features',
            iconUrl: 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/openai.svg',
            value: null,
            saving: openAiApiKeySaving,
            loading: openAiApiKeyLoading,
            startEditing: true,
            onSave: async (val) => {
                const newKeys = [...openAiApiKeys, val];
                await saveOpenAiApiKeys(newKeys);
                setAddedProviders(prev => {
                    const idx = prev.indexOf('openai_api_key');
                    if (idx !== -1) {
                        const next = [...prev];
                        next.splice(idx, 1);
                        return next;
                    }
                    return prev;
                });
            },
            onDelete: async () => {
                setAddedProviders(prev => {
                    const idx = prev.indexOf('openai_api_key');
                    if (idx !== -1) {
                        const next = [...prev];
                        next.splice(idx, 1);
                        return next;
                    }
                    return prev;
                });
            }
        });
    }

    const numUnsavedClaude = addedProviders.filter(p => p === 'anthropic_api_key').length;
    for (let i = 0; i < numUnsavedClaude; i++) {
        apiKeysConfig.push({
            id: `anthropic_api_key_unsaved_${i}`,
            name: `Anthropic API Key`,
            description: 'Provide an API Key from Anthropic for AI features',
            iconUrl: 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/claude.svg',
            value: null,
            saving: claudeApiKeySaving,
            loading: claudeApiKeyLoading,
            startEditing: true,
            onSave: async (val) => {
                const newKeys = [...claudeApiKeys, val];
                await saveClaudeApiKeys(newKeys);
                setAddedProviders(prev => {
                    const idx = prev.indexOf('anthropic_api_key');
                    if (idx !== -1) {
                        const next = [...prev];
                        next.splice(idx, 1);
                        return next;
                    }
                    return prev;
                });
            },
            onDelete: async () => {
                setAddedProviders(prev => {
                    const idx = prev.indexOf('anthropic_api_key');
                    if (idx !== -1) {
                        const next = [...prev];
                        next.splice(idx, 1);
                        return next;
                    }
                    return prev;
                });
            }
        });
    }

    return (
        <main className="flex-1 p-12 overflow-y-auto custom-scrollbar animate-in fade-in duration-500">
            <div className="max-w-3xl mx-auto space-y-8">
                <SettingsHeader tab={tab} onTabChange={setTab} />

                {tab === 'system' && (
                    <>
                        <ApiKeysPanel
                            keys={apiKeysConfig}
                            availableProviders={availableProviders}
                            onAddProvider={(id) => setAddedProviders(prev => [...prev, id])}
                            onConfirm={onConfirm}
                        />
                        <UserAgentPanel
                            selection={userAgentSelection}
                            options={userAgentOptions}
                            loading={userAgentLoading}
                            onChange={saveUserAgent}
                        />
                        <VersionPanel version={APP_VERSION} />
                        <StoragePanel onClearStorage={onClearStorage} />
                    </>
                )}

                {tab === 'data' && (
                    <>
                        <CapturesPanel
                            captures={captures}
                            loading={dataLoading}
                            onRefresh={loadData}
                            onDelete={deleteCapture}
                        />

                        <CookiesPanel
                            cookies={cookies}
                            originsCount={cookieOrigins.length}
                            loading={dataLoading}
                            onClear={() => onClearStorage('cookies')}
                            onDelete={deleteCookie}
                        />
                    </>
                )}

                {tab === 'proxies' && (
                    <ProxiesPanel
                        proxies={proxies}
                        defaultProxyId={defaultProxyId}
                        includeDefaultInRotation={includeDefaultInRotation}
                        rotationMode={rotationMode}
                        loading={proxiesLoading}
                        onRefresh={loadProxies}
                        onAdd={addProxy}
                        onImport={importProxies}
                        onUpdate={updateProxy}
                        onDelete={deleteProxy}
                        onDeleteMultiple={deleteProxies}
                        onSetDefault={setDefaultProxy}
                        onToggleIncludeDefault={toggleIncludeDefaultInRotation}
                        onRotationModeChange={updateRotationMode}
                    />
                )}

                <div className="pt-8 flex justify-center border-t border-white/5 mt-8">
                    <GithubStarPill />
                </div>
            </div>
        </main>
    );
};

export default SettingsScreen;
