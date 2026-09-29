import type { Deck } from '../model.ts';
import { arrow, beat, box, text } from './helpers.ts';

export const deck: Deck = {
  id: '__WHITEBOARD_SLUG__',
  title: '__WHITEBOARD_TITLE__',
  subtitle: 'A whiteboard field guide',
  caption: 'Starter diagram - replace the sample narrative before presenting.',
  sources: [],
  boards: [
    {
      id: 'overview',
      title: 'The big picture',
      theme: '01 / FRAME THE IDEA',
      intro: 'Start with one clear idea.',
      description: 'A starter composition. Replace these sample labels and notes with researched topic content.',
      elements: [
        text('title', 70, 48, 50, '__WHITEBOARD_TITLE__', 1330),
        text('subtitle', 73, 128, 25, 'A sample narrative to replace with your own.', 1310, 'muted'),
        box('main-cloud', 300, 250, 865, 290, 'ink', 'cloud'),
        text('main-idea', 502, 366, 44, 'Frame the idea', 650),
        text('takeaway', 376, 691, 30, 'One board. One clear message.', 1000, 'blue'),
      ],
      beats: [
        beat('frame', 'Introduce the topic', ['title', 'subtitle'], 'Replace the sample narrative before presenting.'),
        beat('main', 'Draw the central idea', ['main-cloud', 'main-idea'], 'Explain the main idea in audience-appropriate terms.'),
        beat('recap', 'Leave a clear takeaway', ['takeaway'], 'Replace this note with the intended takeaway.'),
      ],
    },
    {
      id: 'flow',
      title: 'Follow the flow',
      theme: '02 / CONNECT THE PARTS',
      intro: 'Make the relationship visible.',
      description: 'A sample flow from an input through a decision to a result. Replace it with a grounded topic-specific explanation.',
      elements: [
        text('title', 70, 48, 52, 'Sketch the flow', 1320),
        box('input-box', 105, 335, 330, 192),
        text('input-label', 192, 394, 36, 'Input', 210),
        arrow('first-arrow', [[443, 432], [576, 432]]),
        box('decision-box', 584, 335, 330, 192),
        text('decision-label', 628, 394, 36, 'Decision', 273),
        arrow('second-arrow', [[922, 432], [1055, 432]]),
        box('result-box', 1063, 335, 330, 192),
        text('result-label', 1142, 394, 36, 'Result', 223),
        text('takeaway', 327, 681, 29, 'Explain what each connection means.', 1110, 'blue'),
      ],
      beats: [
        beat('frame', 'Frame the flow', ['title'], 'Describe the scenario. Mark it as illustrative if it is not a live trace.'),
        beat('input', 'Start with the input', ['input-box', 'input-label'], 'Explain the input and its source.'),
        beat('decision', 'Describe the decision', ['first-arrow', 'decision-box', 'decision-label'], 'Explain the transformation or decision, not just the arrow.'),
        beat('result', 'Show the result', ['second-arrow', 'result-box', 'result-label', 'takeaway'], 'Explain the result and its limitations.'),
      ],
    },
  ],
};
