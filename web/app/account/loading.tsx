import AppLoadingIcon from '@/components/AppLoadingIcon';

/** Shows RooGPS logo loading when navigating between account routes (orders, subscription, etc.). */
export default function AccountLoading() {
  return (
    <div className="app-loading">
      <AppLoadingIcon />
    </div>
  );
}
