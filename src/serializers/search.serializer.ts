import type { SearchResults } from '../types/api.js';
import type {
  IInsightDoc,
  IPersonWithPhoto,
  IPracticeAreaWithImage,
} from '../interfaces/populated.interface.js';
import { toCard as practiceAreaCard } from './practice-area.serializer.js';
import { toSummary as personSummary } from './person.serializer.js';
import { toCard as insightCard } from './insight.serializer.js';

export interface SearchSources {
  practiceAreas: IPracticeAreaWithImage[];
  people: IPersonWithPhoto[];
  insights: IInsightDoc[];
}

export const toSearchResults = (sources: SearchSources): SearchResults => ({
  practiceAreas: sources.practiceAreas.map(practiceAreaCard),
  people: sources.people.map(personSummary),
  insights: sources.insights.map(insightCard),
});
