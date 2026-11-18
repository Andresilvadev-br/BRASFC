import { careerView } from '#lib/domain/view.ts';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = ({ data }) => ({
	...data,
	view: careerView(data.career, data.results)
});
