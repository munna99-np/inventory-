import pathlib
path = pathlib.Path("src/routes/ConstructionPriceAnalysisPage.tsx")
text = path.read_text(encoding="utf-8")
needle = "  const [entries, setEntries] = useState<PriceEntry[]>(() => [\n    {\n      id: generateId(),\n      particular: 'Ready-mix concrete M30',\n      unit: UNIT_OPTIONS[0]?.symbol ?? 'm³',\n      quantity: 1,\n      rate: 10500,\n      amount: 10500,\n      notes: 'Pump placing & admixture included in base rate.',\n      vendor: 'Demo supplier',\n      createdAt: new Date().toISOString(),\n    },\n  ])\n\n"
if needle not in text:
    raise SystemExit('needle not found')
insertion = needle + "  useEffect(() => {\n    if (!form.unit and UNIT_OPTIONS):\n      setForm(lambda prev: {**prev, 'unit': UNIT_OPTIONS[0].value})\n  }, [form.unit])\n\n"
