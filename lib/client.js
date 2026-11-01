window.__ModuleLoader__.load({
	id: "dsh-feiyu-persona",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const jsxRuntime = require("react/jsx-runtime");

		/** 字典命名空间。 */
		const NS = "feiyuPersona";
		/** 设置页席位 id。 */
		const SECTION_ID = "feiyu";
		/** 宿主接口（见 lib/index.js）。 */
		const STATUS_PATH = "/api/dsh-feiyu-persona/status";
		const SAVE_PATH = "/api/dsh-feiyu-persona/save";

		const zh = {
			nav: "小鱼",
			title: "人设",
			intro: "一条人设、全局生效。左边是正文，右边是每轮挂在后面的语气规矩，改完下一个请求就生效，不用重启。",
			loading: "读取中…",
			reload: "重新读取",
			save: "保存",
			saving: "保存中…",
			saved: "已保存，下一个请求生效",
			failed: "保存失败",
			loadFailed: "读取失败",
			personaTitle: "人设正文",
			personaHint: "写她是谁、怎么做事。这一段每轮都在，别写太长。",
			suffixTitle: "语气规矩",
			suffixHint: "写她怎么说。一段一条，留空就不挂。",
			chars: (n, max) => `${n} / ${max} 字`,
			enable: "启用",
			enabled: "已启用",
			disabled: "已停用",
			echoLabel: "话术提醒",
			echoValue: (tokens) => `每长 ${tokens.toLocaleString()} token 补一次`,
			echoOff: "已关闭",
			updated: (at) => `上次保存：${at}`,
			neverSaved: "还没改过，用的是插件自带的正文",
			emptyError: "正文不能为空",
			storePath: "存放位置",
			discard: "放弃修改",
			dirty: "有未保存的修改",
		};

		const en = {
			nav: "Feiyu",
			title: "Persona",
			intro: "One persona, applied globally. Left is the body, right is the per-turn tone rules. Saving takes effect on the next request — no restart.",
			loading: "Loading…",
			reload: "Reload",
			save: "Save",
			saving: "Saving…",
			saved: "Saved, effective on the next request",
			failed: "Save failed",
			loadFailed: "Load failed",
			personaTitle: "Persona body",
			personaHint: "Who she is and how she works. This ships every turn — keep it short.",
			suffixTitle: "Tone rules",
			suffixHint: "How she speaks. One rule per line; leave empty to skip.",
			chars: (n, max) => `${n} / ${max} chars`,
			enable: "Enabled",
			enabled: "Enabled",
			disabled: "Disabled",
			echoLabel: "Reminder",
			echoValue: (tokens) => `every ${tokens.toLocaleString()} tokens`,
			echoOff: "off",
			updated: (at) => `Last saved: ${at}`,
			neverSaved: "Never edited; shipping the bundled text",
			emptyError: "The persona body cannot be empty",
			storePath: "Stored at",
			discard: "Discard changes",
			dirty: "Unsaved changes",
		};

		async function fetchStatus() {
			const response = await fetch(STATUS_PATH, { headers: { accept: "application/json" } });
			const body = await response.json().catch(() => null);
			if (!body || body.ok !== true) {
				throw new Error((body && body.error) || `HTTP ${response.status}`);
			}
			return body.value;
		}

		async function postSave(payload) {
			const response = await fetch(SAVE_PATH, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload),
			});
			const body = await response.json().catch(() => null);
			if (!body || body.ok !== true) {
				throw new Error((body && body.error) || `HTTP ${response.status}`);
			}
			return body.value;
		}

		/** 时间戳按本地时区显示；坏了就原样吐回去，不编一个时间。 */
		function timeText(iso) {
			if (!iso) return "";
			const date = new Date(iso);
			if (Number.isNaN(date.getTime())) return iso;
			return date.toLocaleString();
		}

		const styles = {
			wrap: { display: "flex", flexDirection: "column", gap: "14px", padding: "4px 0 12px" },
			head: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" },
			title: { fontSize: "15px", fontWeight: 600, margin: 0 },
			intro: { fontSize: "12.5px", opacity: 0.72, lineHeight: 1.6, margin: 0 },
			grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" },
			card: { display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 },
			label: { fontSize: "12.5px", fontWeight: 600 },
			hint: { fontSize: "11.5px", opacity: 0.6 },
			area: {
				width: "100%",
				minHeight: "240px",
				resize: "vertical",
				fontFamily: "inherit",
				fontSize: "12.5px",
				lineHeight: 1.6,
				padding: "10px 12px",
				borderRadius: "8px",
				border: "1px solid rgba(127,127,127,0.32)",
				background: "rgba(127,127,127,0.06)",
				color: "inherit",
				boxSizing: "border-box",
			},
			row: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" },
			meta: { fontSize: "11.5px", opacity: 0.6 },
			button: {
				font: "inherit",
				fontSize: "12.5px",
				padding: "6px 14px",
				borderRadius: "7px",
				border: "1px solid rgba(127,127,127,0.32)",
				background: "transparent",
				color: "inherit",
				cursor: "pointer",
			},
			primary: {
				font: "inherit",
				fontSize: "12.5px",
				padding: "6px 16px",
				borderRadius: "7px",
				border: "1px solid rgba(76,132,255,0.65)",
				background: "rgba(76,132,255,0.16)",
				color: "inherit",
				cursor: "pointer",
			},
			ok: { fontSize: "12px", color: "#3f9d63" },
			error: { fontSize: "12px", color: "#d9534f" },
			chip: { fontSize: "11.5px", padding: "2px 8px", borderRadius: "999px", border: "1px solid rgba(127,127,127,0.32)" },
		};

		/**
		 * 设置页里的「小鱼」小节：两栏文本 + 保存。
		 * 没有导入导出、没有多套人设、没有工作区/会话档——这一版就是要简单。
		 */
		function FeiyuPersonaSection(props) {
			const t = typeof props?.t === "function" ? props.t : (key) => key;
			const [state, setState] = react.useState({ status: "loading" });
			const [persona, setPersona] = react.useState("");
			const [suffix, setSuffix] = react.useState("");
			const [enabled, setEnabled] = react.useState(true);
			const [busy, setBusy] = react.useState(false);
			const [message, setMessage] = react.useState(null);
			const [savedAt, setSavedAt] = react.useState(null);
			const loaded = react.useRef({ persona: "", suffix: "" });

			const hydrate = react.useCallback((value) => {
				setPersona(value.persona ?? "");
				setSuffix(value.suffix ?? "");
				setEnabled(value.enabled !== false);
				loaded.current = { persona: value.persona ?? "", suffix: value.suffix ?? "" };
				setSavedAt(value.updatedAt || null);
			}, []);

			const load = react.useCallback(() => {
				setState({ status: "loading" });
				setMessage(null);
				fetchStatus()
					.then((value) => {
						hydrate(value);
						setState({ status: "ready", value });
					})
					.catch((error) => setState({ status: "error", message: error?.message || String(error) }));
			}, [hydrate]);

			react.useEffect(() => {
				load();
			}, [load]);

			const value = state.status === "ready" ? state.value : null;
			const dirty = persona !== loaded.current.persona || suffix !== loaded.current.suffix;

			const save = () => {
				if (persona.trim().length === 0) {
					setMessage({ kind: "error", text: t("emptyError") });
					return;
				}
				setBusy(true);
				setMessage(null);
				postSave({ persona, suffix, enabled })
					.then((next) => {
						hydrate(next);
						setState({ status: "ready", value: next });
						setMessage({ kind: "ok", text: t("saved") });
					})
					.catch((error) => setMessage({ kind: "error", text: `${t("failed")}：${error?.message || error}` }))
					.finally(() => setBusy(false));
			};

			if (state.status === "loading") {
				return jsxRuntime.jsx("div", { style: styles.meta, children: t("loading") });
			}
			if (state.status === "error") {
				return jsxRuntime.jsx("div", { style: styles.error, children: `${t("loadFailed")}：${state.message}` });
			}

			return jsxRuntime.jsx("div", { style: styles.wrap }, [
				jsxRuntime.jsx("div", { style: styles.head }, [
					jsxRuntime.jsx("h3", { style: styles.title, children: t("title") }),
					jsxRuntime.jsx("div", { style: styles.row }, [
						jsxRuntime.jsx("span", { style: styles.chip, children: value.enabled ? t("enabled") : t("disabled") }),
						jsxRuntime.jsx("span", { style: styles.chip, children: value.echoTokens > 0 ? t("echoValue")(value.echoTokens) : t("echoOff") }),
					]),
				]),
				jsxRuntime.jsx("p", { style: styles.intro, children: t("intro") }),
				jsxRuntime.jsx("div", { style: styles.grid }, [
					jsxRuntime.jsx("div", { style: styles.card }, [
						jsxRuntime.jsx("div", { style: styles.label, children: t("personaTitle") }),
						jsxRuntime.jsx("div", { style: styles.hint, children: t("personaHint") }),
						jsxRuntime.jsx("textarea", {
							style: styles.area,
							value: persona,
							spellCheck: false,
							onChange: (event) => setPersona(event.target.value),
						}),
						jsxRuntime.jsx("div", { style: styles.meta, children: t("chars")(persona.length, value.maxPersonaChars) }),
					]),
					jsxRuntime.jsx("div", { style: styles.card }, [
						jsxRuntime.jsx("div", { style: styles.label, children: t("suffixTitle") }),
						jsxRuntime.jsx("div", { style: styles.hint, children: t("suffixHint") }),
						jsxRuntime.jsx("textarea", {
							style: styles.area,
							value: suffix,
							spellCheck: false,
							onChange: (event) => setSuffix(event.target.value),
						}),
						jsxRuntime.jsx("div", { style: styles.meta, children: t("chars")(suffix.length, value.maxSuffixChars) }),
					]),
				]),
				jsxRuntime.jsx("div", { style: styles.row }, [
					jsxRuntime.jsx("button", {
						type: "button",
						style: styles.primary,
						disabled: busy,
						onClick: save,
						children: busy ? t("saving") : t("save"),
					}),
					jsxRuntime.jsx("button", {
						type: "button",
						style: styles.button,
						disabled: busy || !dirty,
						onClick: () => {
							setPersona(loaded.current.persona);
							setSuffix(loaded.current.suffix);
							setMessage(null);
						},
						children: t("discard"),
					}),
					jsxRuntime.jsx("label", { style: { ...styles.meta, display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" } }, [
						jsxRuntime.jsx("input", {
							type: "checkbox",
							checked: enabled,
							onChange: (event) => setEnabled(event.target.checked),
						}),
						t("enable"),
					]),
					dirty ? jsxRuntime.jsx("span", { style: styles.meta, children: t("dirty") }) : null,
					message ? jsxRuntime.jsx("span", { style: message.kind === "ok" ? styles.ok : styles.error, children: message.text }) : null,
				]),
				jsxRuntime.jsx("div", { style: styles.meta, children: savedAt ? t("updated")(timeText(savedAt)) : t("neverSaved") }),
				jsxRuntime.jsx("div", { style: styles.meta, children: `${t("storePath")}：${value.storePath}` }),
			]);
		}

		/** 需要的客户端服务：slot 注册表与本地化字典。 */
		const inject = ["slots", "locale"];

		/**
		 * 把「小鱼」注册成设置页里的一个小节。
		 * @param ctx 浏览器插件上下文
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-feiyu-persona: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: SECTION_ID,
				order: 17,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({ t }),
			}, FeiyuPersonaSection));
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.NS = NS;
		exports.SECTION_ID = SECTION_ID;
		exports.FeiyuPersonaSection = FeiyuPersonaSection;
		return module.exports;
	},
});
