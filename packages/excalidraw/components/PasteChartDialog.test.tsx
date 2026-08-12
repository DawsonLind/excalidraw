import { act } from "@testing-library/react";

import {
  DEFAULT_ELEMENT_PROPS,
  THEME,
  applyDarkModeFilter,
} from "@excalidraw/common";

import type { Theme } from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import { render, waitFor } from "../tests/test-utils";

import type { Spreadsheet } from "../charts";

const { h } = window;

const spreadsheet: Spreadsheet = {
  title: "Week Index",
  labels: ["Week 1", "Week 2", "Week 3"],
  series: [{ title: "Users", values: [814, 10301, 4264] }],
};

const RAW_TEXT = "plain text preview";

const getPlainTextPreviewFill = () => {
  const text = Array.from(
    document.querySelectorAll<SVGTextElement>(".ChartPreview__canvas text"),
  ).find((node) => node.textContent === RAW_TEXT);

  return text?.getAttribute("fill") ?? null;
};

const renderPasteChartDialog = async (theme: Theme) => {
  await render(<Excalidraw />);

  act(() => {
    h.setState({
      theme,
      openDialog: { name: "charts", data: spreadsheet, rawText: RAW_TEXT },
    });
  });

  await waitFor(() => {
    expect(getPlainTextPreviewFill()).not.toBe(null);
  });
};

describe("PasteChartDialog previews", () => {
  it("exports previews without dark mode under light themes", async () => {
    await renderPasteChartDialog(THEME.PAPER);

    expect(getPlainTextPreviewFill()).toBe(DEFAULT_ELEMENT_PROPS.strokeColor);
  });

  it("exports previews with dark mode under named dark themes", async () => {
    await renderPasteChartDialog(THEME.MIDNIGHT);

    expect(getPlainTextPreviewFill()).toBe(
      applyDarkModeFilter(DEFAULT_ELEMENT_PROPS.strokeColor),
    );
  });
});
